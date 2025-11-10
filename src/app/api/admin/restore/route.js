import { sql } from '@vercel/postgres';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const backup = await request.json();
    
    // Validate backup structure
    if (!backup.tables || !backup.tables.properties) {
      return NextResponse.json({ error: 'Invalid backup file format' }, { status: 400 });
    }

    // Start transaction
    await sql`BEGIN`;

    try {
      // Clear existing data (in reverse dependency order)
      await sql`DELETE FROM property_scenarios`;
      await sql`DELETE FROM property_actuals`;
      await sql`DELETE FROM properties`;

      // Restore properties table
      if (backup.tables.properties.length > 0) {
        for (const property of backup.tables.properties) {
          await sql`
            INSERT INTO properties (
              id, address, city, state, zip, purchase_price, down_payment_pct, 
              interest_apr_pct, loan_years, monthly_rent, property_tax_pct, 
              tax_annual, tax_input_mode, hoa_monthly, insurance_monthly,
              maintenance_pct_rent, vacancy_pct_rent, management_pct_rent, 
              other_monthly, zillow_zpid, crime_index, purchased, year_purchased, 
              month_purchased, initial_investment, mortgage_free, bedrooms, 
              bathrooms, square_footage, year_built, abbreviation,
              county_tax_website, city_tax_website, notes, mortgage_payoff_date,
              current_appraisal_value, current_county_tax_rate, current_city_tax_rate,
              assessment_percentage, current_market_value, current_expenses_annual,
              current_mortgage_balance, current_mortgage_rate, current_mortgage_payment,
              current_mortgage_term_remaining, current_rent_monthly, current_management_pct,
              current_hoa_monthly, market_value_updated_at, deleted_at
            ) VALUES (
              ${property.id}, ${property.address}, ${property.city}, ${property.state}, 
              ${property.zip}, ${property.purchase_price}, ${property.down_payment_pct},
              ${property.interest_apr_pct}, ${property.loan_years}, ${property.monthly_rent},
              ${property.property_tax_pct}, ${property.tax_annual}, ${property.tax_input_mode},
              ${property.hoa_monthly}, ${property.insurance_monthly}, ${property.maintenance_pct_rent},
              ${property.vacancy_pct_rent}, ${property.management_pct_rent}, ${property.other_monthly},
              ${property.zillow_zpid}, ${property.crime_index}, ${property.purchased},
              ${property.year_purchased}, ${property.month_purchased}, ${property.initial_investment},
              ${property.mortgage_free}, ${property.bedrooms}, ${property.bathrooms},
              ${property.square_footage}, ${property.year_built}, ${property.abbreviation},
              ${property.county_tax_website}, ${property.city_tax_website}, ${property.notes},
              ${property.mortgage_payoff_date}, ${property.current_appraisal_value},
              ${property.current_county_tax_rate}, ${property.current_city_tax_rate},
              ${property.assessment_percentage}, ${property.current_market_value},
              ${property.current_expenses_annual}, ${property.current_mortgage_balance},
              ${property.current_mortgage_rate}, ${property.current_mortgage_payment},
              ${property.current_mortgage_term_remaining}, ${property.current_rent_monthly},
              ${property.current_management_pct}, ${property.current_hoa_monthly},
              ${property.market_value_updated_at}, ${property.deleted_at}
            )
          `;
        }
      }

      // Restore property_actuals table
      if (backup.tables.property_actuals?.length > 0) {
        for (const actual of backup.tables.property_actuals) {
          await sql`
            INSERT INTO property_actuals (
              property_id, year, gross_income, total_expenses, depreciation, 
              net_income, zillow_value
            ) VALUES (
              ${actual.property_id}, ${actual.year}, ${actual.gross_income},
              ${actual.total_expenses}, ${actual.depreciation}, ${actual.net_income},
              ${actual.zillow_value}
            )
          `;
        }
      }

      // Restore property_scenarios table
      if (backup.tables.property_scenarios?.length > 0) {
        for (const scenario of backup.tables.property_scenarios) {
          await sql`
            INSERT INTO property_scenarios (
              id, property_id, name, down_payment_pct, interest_apr_pct, 
              loan_years, created_at
            ) VALUES (
              ${scenario.id}, ${scenario.property_id}, ${scenario.name},
              ${scenario.down_payment_pct}, ${scenario.interest_apr_pct},
              ${scenario.loan_years}, ${scenario.created_at}
            )
          `;
        }
      }

      // Reset sequences to max values
      const maxPropertyId = backup.tables.properties.length > 0 ? 
        Math.max(...backup.tables.properties.map(p => p.id)) : 0;
      const maxScenarioId = backup.tables.property_scenarios?.length > 0 ? 
        Math.max(...backup.tables.property_scenarios.map(s => s.id)) : 0;

      if (maxPropertyId > 0) {
        await sql`SELECT setval('properties_id_seq', ${maxPropertyId})`;
      }
      if (maxScenarioId > 0) {
        await sql`SELECT setval('property_scenarios_id_seq', ${maxScenarioId})`;
      }

      await sql`COMMIT`;

      return NextResponse.json({ 
        success: true, 
        message: `Database restored successfully. Properties: ${backup.tables.properties.length}, Actuals: ${backup.tables.property_actuals?.length || 0}, Scenarios: ${backup.tables.property_scenarios?.length || 0}`,
        timestamp: backup.timestamp,
        schema_version: backup.schema_version
      });

    } catch (error) {
      await sql`ROLLBACK`;
      throw error;
    }

  } catch (error) {
    console.error('Restore failed:', error);
    return NextResponse.json({ error: 'Restore failed: ' + error.message }, { status: 500 });
  }
}