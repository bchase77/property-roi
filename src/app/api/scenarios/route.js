import { NextResponse } from 'next/server';
import { init, getAllScenarios } from '@/lib/db';

export async function GET() {
  try {
    await init();
    const scenarios = await getAllScenarios();
    return NextResponse.json(scenarios);
  } catch (error) {
    console.error('Failed to fetch scenarios:', error);
    return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 });
  }
}