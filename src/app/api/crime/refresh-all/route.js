// API endpoint to refresh crime data for all properties
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    console.log('🔄 Starting crime data refresh for all properties...');
    
    // Get all properties
    const propertiesResponse = await fetch('http://localhost:3000/api/properties');
    const properties = await propertiesResponse.json();
    
    if (!Array.isArray(properties)) {
      throw new Error('Failed to fetch properties');
    }

    console.log(`📊 Found ${properties.length} properties to update`);
    
    const results = [];
    
    for (const property of properties) {
      try {
        console.log(`🏠 Updating crime data for: ${property.address}, ${property.city}`);
        
        // Fetch new crime data using local API
        const crimeResponse = await fetch('http://localhost:3000/api/crime/local-data', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            city: property.city,
            state: property.state,
            address: property.address
          }),
        });

        if (!crimeResponse.ok) {
          console.log(`⚠️ Crime data failed for ${property.address}: ${crimeResponse.status}`);
          results.push({
            property: `${property.address}, ${property.city}`,
            status: 'failed',
            error: `HTTP ${crimeResponse.status}`
          });
          continue;
        }

        const crimeData = await crimeResponse.json();
        
        // Update property with new crime data - map to the correct field names for the API
        const updateData = {
          ...property,
          crimeIndex: crimeData.crimeIndex || crimeData.crimeScore || 5, // This maps to crime_index in database
          crimeScore: crimeData.crimeScore,
          riskLevel: crimeData.riskLevel,
          crimeSource: crimeData.source,
          crimeUpdatedAt: new Date().toISOString()
        };
        
        console.log(`💾 Updating ${property.address} with crime index: ${updateData.crimeIndex}`);

        const updateResponse = await fetch(`http://localhost:3000/api/properties/${property.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(updateData),
        });

        if (updateResponse.ok) {
          console.log(`✅ Updated ${property.address}: Crime Index ${crimeData.crimeIndex || crimeData.crimeScore}`);
          results.push({
            property: `${property.address}, ${property.city}`,
            status: 'success',
            oldIndex: property.crime_index,
            newIndex: crimeData.crimeIndex || crimeData.crimeScore,
            source: crimeData.source
          });
        } else {
          console.log(`❌ Failed to update ${property.address} in database`);
          results.push({
            property: `${property.address}, ${property.city}`,
            status: 'failed',
            error: 'Database update failed'
          });
        }

        // Small delay to avoid overwhelming the APIs
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`❌ Error updating ${property.address}:`, error);
        results.push({
          property: `${property.address}, ${property.city}`,
          status: 'failed',
          error: error.message
        });
      }
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const failedCount = results.filter(r => r.status === 'failed').length;

    console.log(`🎉 Crime data refresh complete: ${successCount} updated, ${failedCount} failed`);

    return NextResponse.json({
      message: `Crime data refresh complete`,
      summary: {
        total: properties.length,
        updated: successCount,
        failed: failedCount
      },
      results
    });

  } catch (error) {
    console.error('❌ Crime refresh error:', error);
    return NextResponse.json({ 
      message: 'Failed to refresh crime data',
      error: error.message
    }, { status: 500 });
  }
}