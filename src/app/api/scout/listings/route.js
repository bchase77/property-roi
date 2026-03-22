import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

export async function GET() {
  await init();
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
    ORDER BY l.last_seen DESC
    LIMIT 600;
  `;
  return NextResponse.json(rows);
}
