import { NextResponse } from 'next/server';
import { init, hardDeleteProperty } from '@/lib/db';

export async function DELETE(req, { params }) {
  await init();
  const { id: paramId } = await params;
  const id = Number(paramId);
  if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const deleted = await hardDeleteProperty(id);
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
