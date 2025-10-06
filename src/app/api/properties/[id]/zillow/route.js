import { NextResponse } from 'next/server';
import { init, updateProperty } from '@/lib/db';
import { fetchZillowData, isValidZpid } from '@/lib/zillow';

export async function POST(req, { params }) {
  await init();
  
  try {
    const { id: paramId } = await params;
    const id = Number(paramId);
    if (!id) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 });
    }

    const body = await req.json();
    const { zpid } = body;

    if (!isValidZpid(zpid)) {
      return NextResponse.json({ error: 'Invalid ZPID format' }, { status: 400 });
    }

    // Fetch data from Zillow
    const zillowData = await fetchZillowData(zpid);
    
    if (!zillowData) {
      return NextResponse.json({ 
        error: 'Could not fetch Zillow data. This may be due to API limitations or the property not being found.' 
      }, { status: 404 });
    }

    // Update the property with the fetched market value
    const updateData = {
      currentMarketValue: zillowData.marketValue,
      marketValueUpdatedAt: zillowData.updatedAt,
      zillowZpid: zpid // Also update the ZPID if it wasn't set
    };

    // We need to include all existing fields for the update
    // This is a simplified approach - in production you'd fetch the existing property first
    const updatedProperty = await updateProperty(id, updateData);

    return NextResponse.json({
      success: true,
      marketValue: zillowData.marketValue,
      zestimate: zillowData.zestimate,
      updatedAt: zillowData.updatedAt,
      source: zillowData.source,
      property: updatedProperty
    });

  } catch (error) {
    console.error('Zillow API error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch Zillow data',
      details: error.message 
    }, { status: 500 });
  }
}

// Get current market value status
export async function GET(req, { params }) {
  await init();
  
  try {
    const id = Number(params.id);
    if (!id) {
      return NextResponse.json({ error: 'Invalid property ID' }, { status: 400 });
    }

    // In a real implementation, you'd fetch the property to get current market value
    // For now, return a status response
    return NextResponse.json({
      available: true,
      lastUpdated: null,
      needsUpdate: true
    });

  } catch (error) {
    console.error('Get market value error:', error);
    return NextResponse.json({ error: 'Failed to get market value status' }, { status: 500 });
  }
}