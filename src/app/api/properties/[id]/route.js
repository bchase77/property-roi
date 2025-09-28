import { NextResponse } from 'next/server';
import { init, updateProperty } from '@/lib/db';

export async function PUT(req, { params }) {
  await init();
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const body = await req.json();
  const updated = await updateProperty(id, body);
  if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(updated);
}

