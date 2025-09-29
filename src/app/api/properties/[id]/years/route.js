import { NextResponse } from 'next/server';
import { init, listPropertyYears, addPropertyYear } from '@/lib/db';

export async function GET(req, { params }) {
  await init();
  const id = Number(params.id);
  if (!id) return NextResponse.json([], { status: 200 });
  const rows = await listPropertyYears(id);
  return NextResponse.json(rows);
}

export async function POST(req, { params }) {
  await init();
  try {
    const id = Number(params.id);
    if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
    const body = await req.json();
    const year = Number(body.year);
    if (!year) return NextResponse.json({ error: 'bad year' }, { status: 400 });
    const rec = await addPropertyYear(id, year, Number(body.income || 0), Number(body.expenses || 0), Number(body.taxes || 0), body.notes || null);
    return NextResponse.json(rec);
  } catch (err) {
    console.error('POST /api/properties/[id]/years error', err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
