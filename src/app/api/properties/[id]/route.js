import { NextResponse } from 'next/server';
import { init, updateProperty, softDeleteProperty } from '@/lib/db';

export async function PUT(req, { params }) {
  await init();
  try {
    const { id: paramId } = await params;
    const id = Number(paramId);
    if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const body = await req.json();
    console.log('Updating property with data:', body);
    if (body.yearPurchased === '') body.yearPurchased = null;
    if (body.initialInvestment === '') body.initialInvestment = 0;
    if (body.zillowZpid === '') body.zillowZpid = null;
    // basic validation for required numeric fields
    const requiredNums = ['purchasePrice','downPct','rateApr','years','monthlyRent','taxPct','hoaMonthly','insuranceMonthly','maintPctRent','vacancyPctRent','mgmtPctRent','otherMonthly'];
    for (const k of requiredNums) {
      if (body[k] === undefined || body[k] === '' || Number.isNaN(Number(body[k]))) {
        return NextResponse.json({ error: `missing or invalid field: ${k}` }, { status: 400 });
      }
    }
    const updated = await updateProperty(id, body);
    if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(updated);
  } catch (err) {
    console.error('PUT /api/properties/[id] error', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

export async function DELETE(req, { params }) {
  await init();
  
  const { id: paramId } = await params;
  const id = Number(paramId);
  if (!id) {
    return NextResponse.json({ error: 'Bad ID' }, { status: 400 });
  }

  const deleted = await softDeleteProperty(id);
  if (!deleted) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  
  return NextResponse.json({ success: true });
}

export async function POST(req) {
  await init();
  try {
    const body = await req.json();

    // Ensure mortgage_payoff_date is treated as a date
    if (body.mortgagePayoffDate && isNaN(Date.parse(body.mortgagePayoffDate))) {
      return NextResponse.json({ error: 'Invalid date for mortgage_payoff_date' }, { status: 400 });
    }

    // Sanitize empty strings for numeric fields
    if (body.yearPurchased === '') body.yearPurchased = null;
    if (body.initialInvestment === '') body.initialInvestment = 0;

    // Basic validation for required numeric fields
    const requiredNums = [
      'purchasePrice', 'downPct', 'rateApr', 'years', 'monthlyRent',
      'taxPct', 'hoaMonthly', 'insuranceMonthly', 'maintPctRent',
      'vacancyPctRent', 'mgmtPctRent', 'otherMonthly'
    ];
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
