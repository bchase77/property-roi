import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';
import { calcM, calcGroup, DEFAULTS } from '@/lib/calcMetrics';

export async function GET(req) {
  await init();

  const { searchParams } = new URL(req.url);
  const sort       = searchParams.get('sort')       || 'atroi';
  const dir        = searchParams.get('dir')        || 'desc';
  const search     = searchParams.get('search')     || '';
  const priceMin   = searchParams.get('priceMin')   || '';
  const priceMax   = searchParams.get('priceMax')   || '';
  const rentPctMin = searchParams.get('rentPctMin') || '';
  const cfMin      = searchParams.get('cfMin')      || '';
  const capMin     = searchParams.get('capMin')      || '';
  const bedsMin    = searchParams.get('bedsMin')    || '';
  const status     = searchParams.get('status')     || 'all'; // 'all' | 'potential' | 'skip' | 'unmarked'
  const tab        = searchParams.get('tab')        || 'active';
  const limit      = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const offset     = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

  // Fetch ALL rows (no LIMIT) — metrics computed after filtering
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

  // ── Stats: cheap field lookups on raw rows, no metric computation ────────────
  const stats = {
    total:   rows.filter(r => !r.listing_status || r.listing_status.toLowerCase() === 'active').length,
    potential: rows.filter(r => r.status === 'potential').length,
    skip:    rows.filter(r => r.status === 'skip').length,
    great:   0, // computed below after metric pass
    pending: rows.filter(r => r.listing_status?.toLowerCase() === 'pending').length,
  };

  // ── Step 1: cheap filters on raw rows (no metrics needed) ───────────────────
  let filtered = rows;

  // Tab filter
  if (tab === 'pending') {
    filtered = filtered.filter(r => r.listing_status?.toLowerCase() === 'pending');
  } else {
    filtered = filtered.filter(r => !r.listing_status || r.listing_status.toLowerCase() === 'active');
  }

  // Search filter
  if (search) {
    const haystack = r => [r.address, r.mls_num, r.mark_notes].filter(Boolean).join(' ').toLowerCase();
    const phraseMatch = search.match(/^"(.+)"$/);
    if (phraseMatch) {
      const phrase = phraseMatch[1].toLowerCase();
      filtered = filtered.filter(r => haystack(r).includes(phrase));
    } else {
      const words = search.toLowerCase().split(/\s+/).filter(Boolean);
      filtered = filtered.filter(r => { const h = haystack(r); return words.some(w => h.includes(w)); });
    }
  }

  // Price, beds, and status filters (raw DB fields — no metrics needed)
  if (priceMin !== '') filtered = filtered.filter(r => Number(r.price) >= Number(priceMin));
  if (priceMax !== '') filtered = filtered.filter(r => Number(r.price) <= Number(priceMax));
  if (bedsMin  !== '') filtered = filtered.filter(r => Number(r.beds)  >= Number(bedsMin));
  if (status === 'potential') filtered = filtered.filter(r => r.status === 'potential');
  if (status === 'skip')      filtered = filtered.filter(r => r.status === 'skip');
  if (status === 'not-skip')  filtered = filtered.filter(r => r.status !== 'skip');
  if (status === 'unmarked')  filtered = filtered.filter(r => !r.status);

  // ── Step 2: compute metrics ONLY for rows that survived cheap filters ────────
  const withMetrics = filtered.map(row => {
    const metrics = calcM(row, row, DEFAULTS);
    const group   = calcGroup(row, row, DEFAULTS);
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
      group:    group ?? null,
    };
  });

  // Update great count now that we have atroi for active rows
  if (tab !== 'pending') {
    stats.great = withMetrics.filter(r => r.atroi != null && r.atroi >= 10).length;
  }

  // ── Step 3: metric filters (need computed values) ────────────────────────────
  let result = withMetrics;
  if (rentPctMin !== '') result = result.filter(r => r.rentPct != null && r.rentPct >= Number(rentPctMin));
  if (cfMin      !== '') result = result.filter(r => r.cf      != null && r.cf      >= Number(cfMin));
  if (capMin     !== '') result = result.filter(r => r.cap     != null && r.cap     >= Number(capMin));

  // ── Sort ─────────────────────────────────────────────────────────────────────
  const extractState = (address) => {
    if (!address) return '';
    const m = address.match(/,\s*([A-Z]{2})(?:\s+\d{5}|,\s*\d{5})?\s*$/);
    return m ? m[1] : '';
  };

  const metricCols  = new Set(['atroi', 'cf', 'cap', 'coc', 'roi5', 'rentPct']);
  const numericCols = new Set(['price', 'beds', 'sqft']);

  result.sort((a, b) => {
    let diff = 0;
    if (metricCols.has(sort)) {
      const av = a[sort], bv = b[sort];
      if (av == null && bv == null) diff = 0;
      else if (av == null) diff = 1;
      else if (bv == null) diff = -1;
      else diff = bv - av;
    } else if (sort === 'groupEq') {
      const av = a.group?.equityROI5 ?? null;
      const bv = b.group?.equityROI5 ?? null;
      if (av == null && bv == null) diff = 0;
      else if (av == null) diff = 1;
      else if (bv == null) diff = -1;
      else diff = bv - av;
    } else if (numericCols.has(sort)) {
      diff = (Number(b[sort]) || 0) - (Number(a[sort]) || 0);
    } else if (sort === 'state') {
      const sa = extractState(a.address), sb = extractState(b.address);
      diff = sa < sb ? -1 : sa > sb ? 1 : 0;
    } else if (sort === 'source') {
      diff = (a.source ?? '') < (b.source ?? '') ? -1 : 1;
    }
    return dir === 'asc' ? -diff : diff;
  });

  const total = result.length;
  return NextResponse.json({ listings: result.slice(offset, offset + limit), stats, total });
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
