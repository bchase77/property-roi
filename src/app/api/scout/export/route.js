import { NextResponse } from 'next/server';
import { db } from '@vercel/postgres';
import { init } from '@/lib/db';
import { calcM, DEFAULTS } from '@/lib/calcMetrics';

// Read-only data feed for external tools (e.g. another Claude Code project
// building on top of this data). Protected by a shared-secret key instead of
// the site's cookie auth, since callers here aren't logged-in browsers.
// Bypasses middleware.js's password gate — see the allowlist there.
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  const expected = process.env.SCOUT_EXPORT_KEY;

  if (!expected || key !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await init();

  const parsedLimit = parseInt(searchParams.get('limit') || '500', 10);
  const limit = Math.min(1000, Math.max(1, Number.isNaN(parsedLimit) ? 500 : parsedLimit));
  const status = searchParams.get('status') || 'not-skip';

  // Mirrors the status filter semantics in /api/scout/listings.
  const conditions = [`(l.listing_status IS NULL OR lower(l.listing_status) = 'active')`];
  if      (status === 'a')        conditions.push(`m.status IN ('a', 'potential')`);
  else if (status === 'b')        conditions.push(`m.status = 'b'`);
  else if (status === 'c')        conditions.push(`m.status = 'c'`);
  else if (status === 'skip')     conditions.push(`m.status = 'skip'`);
  else if (status === 'sold')     conditions.push(`m.status = 'sold'`);
  else if (status === 'unmarked') conditions.push(`m.status IS NULL`);
  else if (status === 'not-skip') conditions.push(`(m.status IS NULL OR m.status NOT IN ('skip', 'sold'))`);
  // 'all': no additional status condition.

  const client = await db.connect();
  try {
    const { rows } = await client.query(`
      SELECT
        l.*,
        m.status,
        m.repair_costs,
        m.hoa_quarterly,
        m.rent_override,
        m.rent_min,
        m.rent_max,
        m.rent_note,
        m.notes AS mark_notes,
        m.sold_date
      FROM scout_listings l
      LEFT JOIN scout_marks m ON l.mls_num = m.mls_num
      WHERE ${conditions.join(' AND ')}
      ORDER BY l.price DESC NULLS LAST
      LIMIT ${limit}
    `);

    const listings = rows.map(row => {
      const metrics = calcM(row, row, DEFAULTS);
      return {
        ...row,
        cf:      metrics?.cf      ?? null,
        cap:     metrics?.cap     ?? null,
        coc:     metrics?.coc     ?? null,
        atroi:   metrics?.atroi   ?? null,
        roi5:    metrics?.roi5    ?? null,
        rent:    metrics?.rent    ?? null,
        rentPct: metrics?.rentPct ?? null,
      };
    });

    return NextResponse.json({ generatedAt: new Date().toISOString(), total: listings.length, listings });
  } finally {
    client.release();
  }
}
