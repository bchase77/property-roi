import { NextResponse } from 'next/server';
import { init, addProperty, listProperties } from '@/lib/db';

export async function GET() {
  await init();
  const rows = await listProperties(200);
  // console.log('🔍 Properties from database:', rows.map(r => ({ id: r.id, address: r.address, abbreviation: r.abbreviation })));
  return NextResponse.json(rows);
}

export async function POST(req) {
  await init();
  try {
    const body = await req.json();
    // sanitize empty strings for numeric fields
    if (body.yearPurchased === '') body.yearPurchased = null;
    if (body.initialInvestment === '') body.initialInvestment = 0;
    if (body.taxAnnual === '') body.taxAnnual = 0;
    if (body.taxPct === '') body.taxPct = 0;
    
    // basic validation for required numeric fields
    const requiredNums = ['purchasePrice','downPct','rateApr','years','monthlyRent','hoaMonthly','insuranceMonthly','maintPctRent','vacancyPctRent','mgmtPctRent','otherMonthly'];
    for (const k of requiredNums) {
      if (body[k] === undefined || body[k] === '' || Number.isNaN(Number(body[k]))) {
        return NextResponse.json({ error: `missing or invalid field: ${k}` }, { status: 400 });
      }
    }
    
    // Validate tax input based on mode
    if (body.taxInputMode === 'annual') {
      if (body.taxAnnual === undefined || body.taxAnnual === '' || Number.isNaN(Number(body.taxAnnual))) {
        return NextResponse.json({ error: 'missing or invalid field: taxAnnual' }, { status: 400 });
      }
    } else {
      if (body.taxPct === undefined || body.taxPct === '' || Number.isNaN(Number(body.taxPct))) {
        return NextResponse.json({ error: 'missing or invalid field: taxPct' }, { status: 400 });
      }
    }
    const saved = await addProperty(body);
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    console.error('POST /api/properties error', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

