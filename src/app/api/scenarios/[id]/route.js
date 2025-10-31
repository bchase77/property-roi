import { NextResponse } from 'next/server';
import { init, updateScenario, deleteScenario } from '@/lib/db';

export async function PUT(request, { params }) {
  try {
    await init();
    const { id } = await params;
    const scenarioId = parseInt(id);
    const scenario = await request.json();
    
    const updatedScenario = await updateScenario(scenarioId, scenario);
    return NextResponse.json(updatedScenario);
  } catch (error) {
    console.error('Failed to update scenario:', error);
    return NextResponse.json({ error: 'Failed to update scenario' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await init();
    const { id } = await params;
    const scenarioId = parseInt(id);
    
    const deletedScenario = await deleteScenario(scenarioId);
    return NextResponse.json(deletedScenario);
  } catch (error) {
    console.error('Failed to delete scenario:', error);
    return NextResponse.json({ error: 'Failed to delete scenario' }, { status: 500 });
  }
}