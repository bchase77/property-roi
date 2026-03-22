import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';
import { init } from '@/lib/db';

export async function POST(req) {
  await init();
  try {
    const { keep_mls, drop_mls, listing_fields, mark_fields } = await req.json();
    if (!keep_mls || !drop_mls) return NextResponse.json({ error: 'keep_mls and drop_mls required' }, { status: 400 });

    const { address, price, beds, baths, sqft, year_built, href } = listing_fields ?? {};
    const { repair_costs, hoa_quarterly, rent_override, status, mark_notes } = mark_fields ?? {};

    // Update listing fields on the record we're keeping
    await sql`
      UPDATE scout_listings SET
        address    = COALESCE(${address ?? null},    address),
        price      = COALESCE(${price != null ? Number(price) : null}, price),
        beds       = COALESCE(${beds != null ? Number(beds) : null},   beds),
        baths      = COALESCE(${baths != null ? Number(baths) : null}, baths),
        sqft       = COALESCE(${sqft != null ? Number(sqft) : null},   sqft),
        year_built = COALESCE(${year_built != null ? Number(year_built) : null}, year_built),
        href       = COALESCE(${href ?? null}, href)
      WHERE mls_num = ${keep_mls}
    `;

    // Upsert mark fields onto the kept record
    await sql`
      INSERT INTO scout_marks (mls_num, repair_costs, hoa_quarterly, rent_override, status, notes, updated_at)
      VALUES (
        ${keep_mls},
        ${repair_costs != null ? Number(repair_costs) : null},
        ${hoa_quarterly != null ? Number(hoa_quarterly) : null},
        ${rent_override != null ? Number(rent_override) : null},
        ${status ?? null},
        ${mark_notes ?? null},
        now()
      )
      ON CONFLICT (mls_num) DO UPDATE SET
        repair_costs  = COALESCE(EXCLUDED.repair_costs,  scout_marks.repair_costs),
        hoa_quarterly = COALESCE(EXCLUDED.hoa_quarterly, scout_marks.hoa_quarterly),
        rent_override = COALESCE(EXCLUDED.rent_override, scout_marks.rent_override),
        status        = COALESCE(EXCLUDED.status,        scout_marks.status),
        notes         = COALESCE(EXCLUDED.notes,         scout_marks.notes),
        updated_at    = now()
    `;

    // Delete the dropped record
    await sql`DELETE FROM scout_marks    WHERE mls_num = ${drop_mls}`;
    await sql`DELETE FROM scout_listings WHERE mls_num = ${drop_mls}`;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
