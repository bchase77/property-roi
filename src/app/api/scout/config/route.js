import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

export async function GET() {
  await init();
  const { rows } = await sql`SELECT * FROM scout_config WHERE name = 'default' LIMIT 1;`;
  return NextResponse.json(rows[0] ?? { min_price: 0, max_price: 500000, min_beds: 3, county: '1245', max_pages: 10 });
}

export async function PUT(req) {
  await init();
  try {
    const { min_price, max_price, min_beds, county, max_pages } = await req.json();
    const { rows } = await sql`
      UPDATE scout_config SET
        min_price = ${min_price ?? 0},
        max_price = ${max_price ?? 500000},
        min_beds  = ${min_beds  ?? 3},
        county    = ${county    ?? '1245'},
        max_pages = ${max_pages ?? 10},
        updated_at = now()
      WHERE name = 'default'
      RETURNING *;
    `;
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
