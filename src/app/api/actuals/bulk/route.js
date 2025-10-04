// src/app/api/actuals/bulk/route.js
import { NextResponse } from 'next/server';
import { init, addActualsBulk } from '@/lib/db';

export async function POST(req) {
  await init();
  try {
    const payload = await req.json(); // { rows }
    const rows = Array.isArray(payload?.rows) ? payload.rows : null;
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'rows required' }, { status: 400 });
    }

    // sanitize & validate each row; collect cleaned rows
    const cleaned = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || {};
      const propertyId = Number(r.propertyId || r.property_id || 0);
      const year = Number(r.year || 0);
      const grossIncome = Number(r.grossIncome ?? r.gross_income ?? 0);
      const totalExpenses = Number(r.totalExpenses ?? r.total_expenses ?? 0);
      const depreciation = Number(r.depreciation ?? 0);

      if (!propertyId || Number.isNaN(propertyId)) {
        return NextResponse.json({ error: `invalid propertyId at row ${i}` }, { status: 400 });
      }
      if (!year || Number.isNaN(year)) {
        return NextResponse.json({ error: `invalid year at row ${i}` }, { status: 400 });
      }

      // ensure numbers are finite
      if (![grossIncome, totalExpenses, depreciation].every(n => Number.isFinite(n))) {
        return NextResponse.json({ error: `invalid numeric value at row ${i}` }, { status: 400 });
      }

      cleaned.push({ propertyId, year, grossIncome, totalExpenses, depreciation });
    }

    // attempt bulk insert; wrap to catch DB errors and provide context
    try {
      await addActualsBulk(cleaned);
      return NextResponse.json({ ok: true, count: cleaned.length });
    } catch (dbErr) {
      console.error('addActualsBulk failed', dbErr);
      return NextResponse.json({ error: dbErr.message || String(dbErr) }, { status: 500 });
    }
  } catch (err) {
    console.error('/api/actuals/bulk error', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

