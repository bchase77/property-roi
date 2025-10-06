import { NextResponse } from 'next/server';
import { init, addProperty, listProperties } from '@/lib/db';

export async function GET() {
  await init();
  const rows = await listProperties(200);
  console.log('🔍 Properties from database:', rows.map(r => ({ id: r.id, address: r.address, abbreviation: r.abbreviation })));
  return NextResponse.json(rows);
}

export async function POST(req) {
  await init();
  try {
    const body = await req.json();
    // sanitize empty strings for numeric fields
    if (body.yearPurchased === '') body.yearPurchased = null;
    if (body.initialInvestment === '') body.initialInvestment = 0;
    // basic validation for required numeric fields
    const requiredNums = ['purchasePrice','downPct','rateApr','years','monthlyRent','taxPct','hoaMonthly','insuranceMonthly','maintPctRent','vacancyPctRent','mgmtPctRent','otherMonthly'];
    for (const k of requiredNums) {
      if (body[k] === undefined || body[k] === '' || Number.isNaN(Number(body[k]))) {
        return NextResponse.json({ error: `missing or invalid field: ${k}` }, { status: 400 });
      }
    }
    const saved = await addProperty(body);
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    console.error('POST /api/properties error', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

