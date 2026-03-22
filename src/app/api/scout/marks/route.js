import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

export async function PATCH(req) {
  await init();
  try {
    const body = await req.json();
    const { mls_num, status, repair_costs, hoa_quarterly, rent_override, rent_min, rent_max, rent_note, notes } = body;
    if (!mls_num) return NextResponse.json({ error: 'missing mls_num' }, { status: 400 });

    // Track when HOA was explicitly confirmed (including $0). null = not being set this request.
    const hoa_set_at = hoa_quarterly != null ? new Date().toISOString() : null;

    const { rows } = await sql`
      INSERT INTO scout_marks (mls_num, status, repair_costs, hoa_quarterly, hoa_set_at, rent_override, rent_min, rent_max, rent_note, notes, updated_at)
      VALUES (
        ${mls_num},
        ${status ?? null},
        ${repair_costs ?? null},
        ${hoa_quarterly ?? null},
        ${hoa_set_at},
        ${rent_override ?? null},
        ${rent_min ?? null},
        ${rent_max ?? null},
        ${rent_note ?? null},
        ${notes ?? null},
        now()
      )
      ON CONFLICT (mls_num) DO UPDATE SET
        status        = COALESCE(EXCLUDED.status,        scout_marks.status),
        repair_costs  = COALESCE(EXCLUDED.repair_costs,  scout_marks.repair_costs),
        hoa_quarterly = COALESCE(EXCLUDED.hoa_quarterly, scout_marks.hoa_quarterly),
        hoa_set_at    = COALESCE(EXCLUDED.hoa_set_at,    scout_marks.hoa_set_at),
        rent_override = COALESCE(EXCLUDED.rent_override, scout_marks.rent_override),
        rent_min      = COALESCE(EXCLUDED.rent_min,      scout_marks.rent_min),
        rent_max      = COALESCE(EXCLUDED.rent_max,      scout_marks.rent_max),
        rent_note     = COALESCE(EXCLUDED.rent_note,     scout_marks.rent_note),
        notes         = COALESCE(EXCLUDED.notes,         scout_marks.notes),
        updated_at    = now()
      RETURNING *;
    `;
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// Allow explicit null to clear a field (e.g. remove a mark)
export async function PUT(req) {
  await init();
  try {
    const body = await req.json();
    const { mls_num, status, repair_costs, hoa_quarterly, rent_override, rent_min, rent_max, rent_note, notes } = body;
    if (!mls_num) return NextResponse.json({ error: 'missing mls_num' }, { status: 400 });

    const { rows } = await sql`
      INSERT INTO scout_marks (mls_num, status, repair_costs, hoa_quarterly, rent_override, rent_min, rent_max, rent_note, notes, updated_at)
      VALUES (${mls_num}, ${status ?? null}, ${repair_costs ?? null}, ${hoa_quarterly ?? null}, ${rent_override ?? null}, ${rent_min ?? null}, ${rent_max ?? null}, ${rent_note ?? null}, ${notes ?? null}, now())
      ON CONFLICT (mls_num) DO UPDATE SET
        status        = ${status ?? null},
        repair_costs  = ${repair_costs ?? null},
        hoa_quarterly = ${hoa_quarterly ?? null},
        rent_override = ${rent_override ?? null},
        rent_min      = ${rent_min ?? null},
        rent_max      = ${rent_max ?? null},
        rent_note     = ${rent_note ?? null},
        notes         = ${notes ?? null},
        updated_at    = now()
      RETURNING *;
    `;
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
