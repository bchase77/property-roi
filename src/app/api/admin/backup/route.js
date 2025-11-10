import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // Get all tables data for backup
    const backup = {
      timestamp: new Date().toISOString(),
      schema_version: '1.0',
      tables: {}
    };

    // Backup properties table
    const properties = await sql`SELECT * FROM properties ORDER BY id`;
    backup.tables.properties = properties.rows;

    // Backup property_actuals table
    const actuals = await sql`SELECT * FROM property_actuals ORDER BY property_id, year`;
    backup.tables.property_actuals = actuals.rows;

    // Backup property_scenarios table
    const scenarios = await sql`SELECT * FROM property_scenarios ORDER BY property_id, id`;
    backup.tables.property_scenarios = scenarios.rows;

    // Create downloadable JSON file
    const filename = `property-roi-backup-${new Date().toISOString().split('T')[0]}.json`;
    
    return new NextResponse(JSON.stringify(backup, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Backup failed:', error);
    return NextResponse.json({ error: 'Backup failed: ' + error.message }, { status: 500 });
  }
}