import { NextResponse } from 'next/server';
import { init, deletePropertyYear } from '@/lib/db';

export async function DELETE(req, { params }) {
  await init();
  const { id: paramId, year: paramYear } = await params;
  const id = Number(paramId);
  const year = Number(paramYear);
  if (!id || !year) return NextResponse.json({ error: 'bad id/year' }, { status: 400 });
  const deleted = await deletePropertyYear(id, year);
  if (!deleted) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
