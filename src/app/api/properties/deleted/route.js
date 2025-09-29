import { NextResponse } from 'next/server';
import { init, listDeletedProperties } from '@/lib/db';

export async function GET() {
  await init();
  const rows = await listDeletedProperties(500);
  return NextResponse.json(rows);
}
