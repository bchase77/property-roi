import { NextResponse } from 'next/server';
import { getActuals } from '@/lib/db';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const propertyIds = searchParams.get('ids');
    
    if (!propertyIds) {
      return NextResponse.json({ error: 'Property IDs required' }, { status: 400 });
    }
    
    const ids = propertyIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    
    if (ids.length === 0) {
      return NextResponse.json({ error: 'Valid property IDs required' }, { status: 400 });
    }
    
    // Fetch historical data for all requested properties
    const actualsData = {};
    
    for (const propertyId of ids) {
      try {
        const actuals = await getActuals(propertyId);
        // console.log(`🔍 Raw actuals data for property ${propertyId}:`, actuals.filter(row => row.year >= 2016).slice(0, 3));
        actualsData[propertyId] = actuals.map(row => ({
          year: row.year,
          grossIncome: Number(row.gross_income),
          totalExpenses: Number(row.total_expenses),
          depreciation: Number(row.depreciation),
          netIncome: Number(row.gross_income) - Number(row.total_expenses),
          zillowValue: row.zillow_value ? Number(row.zillow_value) : null
        }));
        // console.log(`🔍 Processed actuals for property ${propertyId}:`, actualsData[propertyId].filter(row => row.year >= 2016).slice(0, 3));
      } catch (error) {
        console.error(`Failed to fetch actuals for property ${propertyId}:`, error);
        actualsData[propertyId] = [];
      }
    }
    
    return NextResponse.json(actualsData);
    
  } catch (error) {
    console.error('Error fetching property actuals:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}