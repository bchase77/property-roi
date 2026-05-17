import { NextResponse } from 'next/server';
import { db } from '@vercel/postgres';
import { init } from '@/lib/db';

// PATCH: update only the fields present in the request body (supports explicit null to clear)
export async function PATCH(req) {
  await init();
  const client = await db.connect();
  try {
    const body = await req.json();
    const { mls_num } = body;
    if (!mls_num) return NextResponse.json({ error: 'missing mls_num' }, { status: 400 });

    // Detect which fields were explicitly sent (even if null)
    const has = k => k in body;

    // Build params array: [mls_num, hasFlag, value, hasFlag, value, ...]
    // Each field gets a boolean flag ($even) and a value ($odd), enabling
    // CASE WHEN $flag THEN $value ELSE scout_marks.col END in the UPDATE SET.
    const vals = [mls_num]; // $1

    // Build params and update clauses in order
    const statusVal  = has('status')        ? (body.status ?? null) : null;
    const repairVal  = has('repair_costs')  ? (body.repair_costs ?? null) : null;
    const hoaVal     = has('hoa_quarterly') ? (body.hoa_quarterly ?? null) : null;
    const rentOvrVal = has('rent_override') ? (body.rent_override ?? null) : null;
    const rentMinVal = has('rent_min')      ? (body.rent_min ?? null) : null;
    const rentMaxVal = has('rent_max')      ? (body.rent_max ?? null) : null;
    const rentNoteVal= has('rent_note')     ? (body.rent_note ?? null) : null;
    const notesVal   = has('notes')         ? (body.notes ?? null) : null;
    const soldDateVal= has('sold_date')     ? (body.sold_date ?? null) : null;
    const hoaSetAt   = has('hoa_quarterly') && body.hoa_quarterly != null ? new Date().toISOString() : null;

    // vals order: $1=mls_num, then pairs of (hasFlag, value) for each field
    // We'll push: hasStatus($2), statusVal($3), hasRepair($4), repairVal($5), ...
    const hasStatus   = has('status');        vals.push(hasStatus);   const $hasS  = vals.length; vals.push(statusVal);   const $S   = vals.length;
    const hasRepair   = has('repair_costs');  vals.push(hasRepair);   const $hasR  = vals.length; vals.push(repairVal);   const $R   = vals.length;
    const hasHoa      = has('hoa_quarterly'); vals.push(hasHoa);      const $hasH  = vals.length; vals.push(hoaVal);     const $H   = vals.length;
    const hasHoaSet   = hasHoa && hoaSetAt != null; vals.push(hasHoaSet); const $hasHSet = vals.length; vals.push(hoaSetAt); const $HSet = vals.length;
    const hasRentOvr  = has('rent_override'); vals.push(hasRentOvr);  const $hasRO = vals.length; vals.push(rentOvrVal); const $RO  = vals.length;
    const hasRentMin  = has('rent_min');      vals.push(hasRentMin);  const $hasRM = vals.length; vals.push(rentMinVal); const $RM  = vals.length;
    const hasRentMax  = has('rent_max');      vals.push(hasRentMax);  const $hasRX = vals.length; vals.push(rentMaxVal); const $RX  = vals.length;
    const hasRentNote = has('rent_note');     vals.push(hasRentNote); const $hasRN = vals.length; vals.push(rentNoteVal);const $RN  = vals.length;
    const hasNotes    = has('notes');         vals.push(hasNotes);    const $hasN  = vals.length; vals.push(notesVal);   const $N   = vals.length;
    const hasSoldDate = has('sold_date');     vals.push(hasSoldDate); const $hasSD = vals.length; vals.push(soldDateVal);const $SD  = vals.length;

    const { rows } = await client.query(`
      INSERT INTO scout_marks
        (mls_num, status, repair_costs, hoa_quarterly, hoa_set_at, rent_override, rent_min, rent_max, rent_note, notes, sold_date, updated_at)
      VALUES
        ($1, $${$S}, $${$R}, $${$H}, $${$HSet}, $${$RO}, $${$RM}, $${$RX}, $${$RN}, $${$N}, $${$SD}, now())
      ON CONFLICT (mls_num) DO UPDATE SET
        status        = CASE WHEN $${$hasS}   THEN $${$S}    ELSE scout_marks.status        END,
        repair_costs  = CASE WHEN $${$hasR}   THEN $${$R}    ELSE scout_marks.repair_costs  END,
        hoa_quarterly = CASE WHEN $${$hasH}   THEN $${$H}    ELSE scout_marks.hoa_quarterly END,
        hoa_set_at    = CASE WHEN $${$hasHSet} THEN $${$HSet} ELSE scout_marks.hoa_set_at   END,
        rent_override = CASE WHEN $${$hasRO}  THEN $${$RO}   ELSE scout_marks.rent_override END,
        rent_min      = CASE WHEN $${$hasRM}  THEN $${$RM}   ELSE scout_marks.rent_min      END,
        rent_max      = CASE WHEN $${$hasRX}  THEN $${$RX}   ELSE scout_marks.rent_max      END,
        rent_note     = CASE WHEN $${$hasRN}  THEN $${$RN}   ELSE scout_marks.rent_note     END,
        notes         = CASE WHEN $${$hasN}   THEN $${$N}    ELSE scout_marks.notes         END,
        sold_date     = CASE WHEN $${$hasSD}  THEN $${$SD}   ELSE scout_marks.sold_date     END,
        updated_at    = now()
      RETURNING *;
    `, vals);
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

// PUT: explicit full overwrite (all fields set to provided values, including null)
export async function PUT(req) {
  await init();
  const client = await db.connect();
  try {
    const body = await req.json();
    const { mls_num, status, repair_costs, hoa_quarterly, rent_override, rent_min, rent_max, rent_note, notes, sold_date } = body;
    if (!mls_num) return NextResponse.json({ error: 'missing mls_num' }, { status: 400 });

    const { rows } = await client.query(`
      INSERT INTO scout_marks (mls_num, status, repair_costs, hoa_quarterly, rent_override, rent_min, rent_max, rent_note, notes, sold_date, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
      ON CONFLICT (mls_num) DO UPDATE SET
        status        = $2,
        repair_costs  = $3,
        hoa_quarterly = $4,
        rent_override = $5,
        rent_min      = $6,
        rent_max      = $7,
        rent_note     = $8,
        notes         = $9,
        sold_date     = $10,
        updated_at    = now()
      RETURNING *;
    `, [mls_num, status ?? null, repair_costs ?? null, hoa_quarterly ?? null, rent_override ?? null, rent_min ?? null, rent_max ?? null, rent_note ?? null, notes ?? null, sold_date ?? null]);
    return NextResponse.json(rows[0]);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}
