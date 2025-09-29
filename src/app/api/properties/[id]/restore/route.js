import { NextResponse } from 'next/server';
import { init, restoreProperty } from '@/lib/db';

export async function POST(req, { params }) {
  await init();
  const id = Number(params.id);
  if (!id) return NextResponse.json({ error: 'bad id' }, { status: 400 });
  const restored = await restoreProperty(id);
  if (!restored) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json(restored);
}
