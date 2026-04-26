import { NextResponse } from 'next/server';
import { sql, db } from '@vercel/postgres';
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
  const capMin     = searchParams.get('capMin')     || '';
  const bedsMin    = searchParams.get('bedsMin')    || '';
  const status     = searchParams.get('status')     || 'all';
  const source     = searchParams.get('source')     || 'all';
  const tab        = searchParams.get('tab')        || 'active';
  const limit      = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
  const offset     = Math.max(0, parseInt(searchParams.get('offset') || '0', 10));

  const client = await db.connect();
  try {
    // ── Stats: fast COUNT query, unaffected by search/price/beds ─────────────────
    const { rows: [s] } = await client.query(`
      SELECT
        COUNT(CASE WHEN l.listing_status IS NULL OR lower(l.listing_status) = 'active' THEN 1 END)::int  AS total,
        COUNT(CASE WHEN m.status = 'potential' THEN 1 END)::int                                           AS potential,
        COUNT(CASE WHEN m.status = 'skip'      THEN 1 END)::int                                           AS skip,
        COUNT(CASE WHEN lower(l.listing_status) = 'pending' THEN 1 END)::int                              AS pending
      FROM scout_listings l
      LEFT JOIN scout_marks m ON l.mls_num = m.mls_num
    `);
    const stats = { total: s.total, potential: s.potential, skip: s.skip, great: 0, pending: s.pending };

    // ── Build dynamic WHERE clause — all cheap filters pushed into SQL ────────────
    const conditions = [];
    const params = [];
    let p = 1;

    // Tab filter
    if (tab === 'pending') {
      conditions.push(`lower(l.listing_status) = 'pending'`);
    } else {
      conditions.push(`(l.listing_status IS NULL OR lower(l.listing_status) = 'active')`);
    }

    // Search: address, mls_num, or notes (case-insensitive)
    if (search) {
      conditions.push(`(l.address ILIKE $${p} OR l.mls_num ILIKE $${p} OR m.notes ILIKE $${p})`);
      params.push(`%${search}%`);
      p++;
    }

    // Price
    if (priceMin !== '') { conditions.push(`l.price >= $${p}`); params.push(Number(priceMin)); p++; }
    if (priceMax !== '') { conditions.push(`l.price <= $${p}`); params.push(Number(priceMax)); p++; }

    // Beds
    if (bedsMin !== '') { conditions.push(`l.beds >= $${p}`); params.push(Number(bedsMin)); p++; }

    // Source
    if (source !== 'all') { conditions.push(`l.source = $${p}`); params.push(source); p++; }

    // Status
    if (status === 'potential') conditions.push(`m.status = 'potential'`);
    else if (status === 'skip')     conditions.push(`m.status = 'skip'`);
    else if (status === 'not-skip') conditions.push(`(m.status IS NULL OR m.status != 'skip')`);
    else if (status === 'unmarked') conditions.push(`m.status IS NULL`);

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await client.query(`
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
      ${where}
    `, params);

    // ── Compute metrics for filtered rows only ────────────────────────────────────
    const withMetrics = rows.map(row => {
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

    if (tab !== 'pending') {
      stats.great = withMetrics.filter(r => r.atroi != null && r.atroi >= 10).length;
    }

    // ── Metric filters (require computed values) ──────────────────────────────────
    let result = withMetrics;
    if (rentPctMin !== '') result = result.filter(r => r.rentPct != null && r.rentPct >= Number(rentPctMin));
    if (cfMin      !== '') result = result.filter(r => r.cf      != null && r.cf      >= Number(cfMin));
    if (capMin     !== '') result = result.filter(r => r.cap     != null && r.cap     >= Number(capMin));

    // ── Sort ──────────────────────────────────────────────────────────────────────
    const extractState = addr => { const m = (addr||'').match(/,\s*([A-Z]{2})(?:\s+\d{5}|,\s*\d{5})?\s*$/); return m ? m[1] : ''; };
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
        const av = a.group?.equityROI5 ?? null, bv = b.group?.equityROI5 ?? null;
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

  } finally {
    client.release();
  }
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
