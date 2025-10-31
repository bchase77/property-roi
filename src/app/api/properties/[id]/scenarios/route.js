import { NextResponse } from 'next/server';
import { init, getScenarios, addScenario } from '@/lib/db';

export async function GET(request, { params }) {
  try {
    await init();
    const { id } = await params;
    const propertyId = parseInt(id);
    const scenarios = await getScenarios(propertyId);
    return NextResponse.json(scenarios);
  } catch (error) {
    console.error('Failed to fetch property scenarios:', error);
    return NextResponse.json({ error: 'Failed to fetch scenarios' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  try {
    await init();
    const { id } = await params;
    const propertyId = parseInt(id);
    const scenario = await request.json();
    
    const newScenario = await addScenario(propertyId, scenario);
    return NextResponse.json(newScenario);
  } catch (error) {
    console.error('Failed to create scenario:', error);
    return NextResponse.json({ error: 'Failed to create scenario' }, { status: 500 });
  }
}