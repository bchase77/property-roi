// src/app/api/actuals/bulk/route.js
import { NextResponse } from 'next/server';
import { init, addActualsBulk } from '@/lib/db';

export async function POST(req) {
  await init();
  const { rows } = await req.json(); // [{propertyId,year,grossIncome,totalExpenses,depreciation}]
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'rows required' }, { status: 400 });
  }
  // basic validation
  for (const r of rows) {
    if (!r.propertyId || !r.year) {
      return NextResponse.json({ error: 'propertyId and year required on each row' }, { status: 400 });
    }
  }
  await addActualsBulk(rows);
  return NextResponse.json({ ok: true, count: rows.length });
}

