import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

export async function PATCH(req) {
  await init();
  try {
    const { id, rentMin, rentMax, rentNotes } = await req.json();
    if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
    const { rows } = await sql`
      UPDATE properties
      SET rent_min = ${rentMin ?? null},
          rent_max = ${rentMax ?? null},
          rent_research_notes = ${rentNotes ?? null}
      WHERE id = ${id}
      RETURNING id, rent_min, rent_max, rent_research_notes;
    `;
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error('PATCH /api/rent-research error', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
