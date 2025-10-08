import { sql } from '@vercel/postgres';
import { analyzeRentIncreases } from '@/lib/rentProjections';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const state = searchParams.get('state');
    
    // Get all historical data for analysis
    const { rows: historicalData } = await sql`
      SELECT 
        pa.property_id,
        p.state,
        p.address,
        pa.year,
        pa.gross_income
      FROM property_actuals pa
      JOIN properties p ON p.id = pa.property_id
      WHERE p.deleted_at IS NULL
        AND pa.gross_income > 0
        ${state ? sql`AND p.state = ${state}` : sql``}
      ORDER BY p.state, pa.property_id, pa.year
    `;
    
    if (!state) {
      // Return analysis for all states
      const states = [...new Set(historicalData.map(row => row.state))];
      const analysis = {};
      
      states.forEach(st => {
        analysis[st] = analyzeRentIncreases(historicalData, st);
      });
      
      return Response.json({
        success: true,
        analysis,
        rawData: historicalData
      });
    } else {
      // Return analysis for specific state
      const analysis = analyzeRentIncreases(historicalData, state);
      
      return Response.json({
        success: true,
        state,
        analysis,
        rawData: historicalData.filter(row => row.state === state)
      });
    }
    
  } catch (error) {
    console.error('Failed to analyze rent data:', error);
    return Response.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}