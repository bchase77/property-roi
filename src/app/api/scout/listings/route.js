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
