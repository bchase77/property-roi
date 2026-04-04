import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';
import { calcM, DEFAULTS } from '@/lib/calcMetrics';

export async function GET(req) {
  await init();

  const { searchParams } = new URL(req.url);
  const sort     = searchParams.get('sort')     || 'atroi';
  const dir      = searchParams.get('dir')      || 'desc';
  const search   = searchParams.get('search')   || '';
  const priceMin = searchParams.get('priceMin') || '';
  const priceMax = searchParams.get('priceMax') || '';
  const tab      = searchParams.get('tab')      || 'active'; // 'active' | 'pending'
  const limit    = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

  // Fetch ALL rows (no LIMIT) with the same JOIN as before
  const { rows } = await sql`
    SELECT
      l.*,
      m.status,
      m.repair_costs,
      m.hoa_quarterly,
      m.hoa_set_at,
      m.rent_override,
      m.rent_min,
      m.rent_max,
      m.rent_note,
      m.notes AS mark_notes,
      (SELECT price FROM scout_price_history WHERE mls_num = l.mls_num ORDER BY recorded_at ASC LIMIT 1) AS first_price,
      (SELECT COUNT(*)::int FROM scout_price_history WHERE mls_num = l.mls_num) AS price_count
    FROM scout_listings l
    LEFT JOIN scout_marks m ON l.mls_num = m.mls_num
  `;

  // Compute metrics for every row (mark fields are already on the row from the JOIN)
  const withMetrics = rows.map(row => {
    const metrics = calcM(row, row, DEFAULTS);
    return {
      ...row,
      cf:       metrics?.cf       ?? null,
      cap:      metrics?.cap      ?? null,
      coc:      metrics?.coc      ?? null,
      atroi:    metrics?.atroi    ?? null,
      atroiErr: metrics?.atroiErr ?? false,
      roi5:     metrics?.roi5     ?? null,
      rent:     metrics?.rent     ?? null,
      rentPct:  metrics?.rentPct  ?? null,
    };
  });

  // Aggregate stats across ALL rows (before any filtering)
  const stats = {
    total:     withMetrics.filter(r => !r.listing_status || r.listing_status.toLowerCase() === 'active').length,
    potential: withMetrics.filter(r => r.status === 'potential').length,
    skip:      withMetrics.filter(r => r.status === 'skip').length,
    great:     withMetrics.filter(r => r.atroi != null && r.atroi >= 10).length,
    pending:   withMetrics.filter(r => r.listing_status?.toLowerCase() === 'pending').length,
  };

  // Filter by tab
  let filtered;
  if (tab === 'pending') {
    filtered = withMetrics.filter(r => r.listing_status?.toLowerCase() === 'pending');
  } else {
    // Active tab: null listing_status = unknown source (REI Nation etc.), keep those
    filtered = withMetrics.filter(r => !r.listing_status || r.listing_status.toLowerCase() === 'active');
  }
  if (search) {
    const haystack = r => [r.address, r.mls_num, r.mark_notes].filter(Boolean).join(' ').toLowerCase();
    const phraseMatch = search.match(/^"(.+)"$/);
    if (phraseMatch) {
      // Quoted phrase — exact substring match
      const phrase = phraseMatch[1].toLowerCase();
      filtered = filtered.filter(r => haystack(r).includes(phrase));
    } else {
      // Unquoted words — OR logic (any word matches)
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      filtered = filtered.filter(r => { const h = haystack(r); return words.some(w => h.includes(w)); });
    }
  }

  // Apply price filters
  if (priceMin !== '') {
    const min = Number(priceMin);
    filtered = filtered.filter(r => Number(r.price) >= min);
  }
  if (priceMax !== '') {
    const max = Number(priceMax);
    filtered = filtered.filter(r => Number(r.price) <= max);
  }

  // Helper: extract state from address
  const extractState = (address) => {
    if (!address) return '';
    const m = address.match(/,\s*([A-Z]{2})(?:\s+\d{5}|,\s*\d{5})?\s*$/);
    return m ? m[1] : '';
  };

  // Sort
  const metricCols = new Set(['atroi', 'cf', 'cap', 'coc', 'roi5', 'rentPct']);
  const numericCols = new Set(['price', 'beds', 'sqft']);

  filtered.sort((a, b) => {
    let diff = 0;
    if (metricCols.has(sort)) {
      const av = a[sort];
      const bv = b[sort];
      // nulls last regardless of direction
      if (av == null && bv == null) diff = 0;
      else if (av == null) diff = 1;
      else if (bv == null) diff = -1;
      else diff = bv - av; // desc by default
    } else if (numericCols.has(sort)) {
      diff = (Number(b[sort]) || 0) - (Number(a[sort]) || 0);
    } else if (sort === 'state') {
      const sa = extractState(a.address);
      const sb = extractState(b.address);
      diff = sa < sb ? -1 : sa > sb ? 1 : 0;
    } else if (sort === 'source') {
      const sa = a.source ?? '';
      const sb = b.source ?? '';
      diff = sa < sb ? -1 : sa > sb ? 1 : 0;
    }
    return dir === 'asc' ? -diff : diff;
  });

  return NextResponse.json({ listings: filtered.slice(0, limit), stats });
}

export async function POST(req) {
  await init();
  try {
    const body = await req.json();
    const {
      address, price, beds, baths, sqft, year_built,
      hoa_yn, href, source = 'manual',
      rent_override, repair_costs, hoa_quarterly, notes,
    } = body;

    if (!address) return NextResponse.json({ error: 'address required' }, { status: 400 });

    // Generate a unique mls_num for manual entries
    const mls_num = `MAN-${Date.now()}`;
    const now = new Date().toISOString();

    await sql`
      INSERT INTO scout_listings
        (mls_num, address, price, beds, baths, sqft, year_built, hoa_yn, href, source, first_seen, last_seen)
      VALUES
        (${mls_num}, ${address}, ${price ?? null}, ${beds ?? null}, ${baths ?? null},
         ${sqft ?? null}, ${year_built ?? null}, ${hoa_yn ?? null}, ${href ?? null},
         ${source}, ${now}, ${now});
    `;

    // Save any mark fields provided
    if (rent_override != null || repair_costs != null || hoa_quarterly != null || notes) {
      await sql`
        INSERT INTO scout_marks (mls_num, rent_override, repair_costs, hoa_quarterly, notes, updated_at)
        VALUES (${mls_num}, ${rent_override ?? null}, ${repair_costs ?? null},
                ${hoa_quarterly ?? null}, ${notes ?? null}, now())
        ON CONFLICT (mls_num) DO UPDATE SET
          rent_override = COALESCE(EXCLUDED.rent_override, scout_marks.rent_override),
          repair_costs  = COALESCE(EXCLUDED.repair_costs,  scout_marks.repair_costs),
          hoa_quarterly = COALESCE(EXCLUDED.hoa_quarterly, scout_marks.hoa_quarterly),
          notes         = COALESCE(EXCLUDED.notes,         scout_marks.notes),
          updated_at    = now();
      `;
    }

    // Return the full joined row so the UI has all fields (including marks)
    const { rows: [full] } = await sql`
      SELECT l.*, m.status, m.repair_costs, m.hoa_quarterly, m.hoa_set_at,
             m.rent_override, m.rent_min, m.rent_max, m.rent_note, m.notes AS mark_notes
      FROM scout_listings l
      LEFT JOIN scout_marks m ON l.mls_num = m.mls_num
      WHERE l.mls_num = ${mls_num};
    `;
    return NextResponse.json(full);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
