import { NextResponse } from 'next/server';
import { init, listArchivedProperties } from '@/lib/db';

export async function GET() {
  try {
    await init();
    const properties = await listArchivedProperties();
    return NextResponse.json(properties);
  } catch (error) {
    console.error('Failed to fetch archived properties:', error);
    return NextResponse.json({ error: 'Failed to fetch archived properties' }, { status: 500 });
  }
}