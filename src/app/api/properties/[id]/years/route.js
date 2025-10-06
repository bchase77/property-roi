import { NextResponse } from 'next/server';
import { init, listPropertyActuals, addPropertyActual } from '@/lib/db';

export async function GET(req, { params }) {
  await init();
  const { id } = await params;
  if (!id) return NextResponse.json([], { status: 400 });

  const propertyId = Number(id);
  const rows = await listPropertyActuals(propertyId);
  return NextResponse.json(rows);
}

export async function POST(req, { params }) {
  await init();
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: 'Property ID required' }, { status: 400 });

    const propertyId = Number(id);
    const yearData = await req.json();
    
    // Validate required fields
    if (!yearData.year || !Number.isFinite(Number(yearData.year))) {
      return NextResponse.json({ error: 'Valid year required' }, { status: 400 });
    }

    const saved = await addPropertyActual(propertyId, yearData);
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    console.error('POST /api/properties/[id]/years error', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}

