// Simple API to update Memphis properties with real crime data
import { NextResponse } from 'next/server';
import { sql } from '@vercel/postgres';

export async function POST(request) {
  try {
    console.log('🔄 Updating Memphis properties with real crime data...');
    
    // Get Memphis crime data
    const crimeResponse = await fetch('http://localhost:3000/api/crime/local-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        city: 'Memphis',
        state: 'TN'
      }),
    });

    if (!crimeResponse.ok) {
      throw new Error(`Failed to fetch Memphis crime data: ${crimeResponse.status}`);
    }

    const crimeData = await crimeResponse.json();
    const crimeIndex = crimeData.crimeIndex || crimeData.crimeScore || 5;
    
    console.log('📊 Memphis crime data:', { crimeIndex, source: crimeData.source });

    // Update all Memphis properties directly with SQL
    const { rows } = await sql`
      UPDATE properties 
      SET crime_index = ${crimeIndex}
      WHERE city = 'Memphis' AND state = 'TN'
      RETURNING address, city, crime_index;
    `;

    console.log('✅ Updated Memphis properties:', rows.length);

    return NextResponse.json({
      message: `Updated ${rows.length} Memphis properties`,
      crimeIndex,
      source: crimeData.source,
      updatedProperties: rows
    });

  } catch (error) {
    console.error('❌ Memphis update error:', error);
    return NextResponse.json({ 
      message: 'Failed to update Memphis properties',
      error: error.message
    }, { status: 500 });
  }
}