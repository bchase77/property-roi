import { NextResponse } from 'next/server';
import { init, updateProperty, softDeleteProperty } from '@/lib/db';

export async function PUT(req, { params }) {
  await init();
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const body = await req.json();
    if (body.yearPurchased === '') body.yearPurchased = null;
    if (body.initialInvestment === '') body.initialInvestment = 0;
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
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const deleted = await softDeleteProperty(id);
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

