import { NextResponse } from 'next/server';
import { init, addProperty, listProperties } from '@/lib/db';

export async function GET() {
  await init();
  const rows = await listProperties(200);
  return NextResponse.json(rows);
}

export async function POST(req) {
  await init();
  const body = await req.json();
  const saved = await addProperty(body);
  return NextResponse.json(saved, { status: 201 });
}

