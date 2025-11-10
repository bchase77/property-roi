import { NextResponse } from 'next/server';
import { init, archiveProperty, unarchiveProperty } from '@/lib/db';

export async function POST(request, { params }) {
  try {
    await init();
    const { id } = await params;
    const propertyId = parseInt(id);
    
    const property = await archiveProperty(propertyId);
    
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    return NextResponse.json(property);
  } catch (error) {
    console.error('Failed to archive property:', error);
    return NextResponse.json({ error: 'Failed to archive property' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await init();
    const { id } = await params;
    const propertyId = parseInt(id);
    
    const property = await unarchiveProperty(propertyId);
    
    if (!property) {
      return NextResponse.json({ error: 'Property not found' }, { status: 404 });
    }
    
    return NextResponse.json(property);
  } catch (error) {
    console.error('Failed to unarchive property:', error);
    return NextResponse.json({ error: 'Failed to unarchive property' }, { status: 500 });
  }
}