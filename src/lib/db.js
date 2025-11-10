import { sql } from '@vercel/postgres';

export async function updateProperty(id, p) {
  console.log (id);
  console.log (p);

  const { rows } = await sql`
    UPDATE properties SET
      address = ${p.address},
      city = ${p.city},
      state = ${p.state ?? null},
      zip = ${p.zip},
      purchase_price = ${p.purchasePrice},
      down_payment_pct = ${p.downPct},
      interest_apr_pct = ${p.rateApr},
      loan_years = ${p.years},
      monthly_rent = ${p.monthlyRent},
      property_tax_pct = ${p.taxPct},
      tax_annual = ${p.taxAnnual ?? 0},
      tax_input_mode = ${p.taxInputMode ?? 'percentage'},
      hoa_monthly = ${p.hoaMonthly},
      insurance_monthly = ${p.insuranceMonthly},
      maintenance_pct_rent = ${p.maintPctRent},
      vacancy_pct_rent = ${p.vacancyPctRent},
      management_pct_rent = ${p.mgmtPctRent},
      other_monthly = ${p.otherMonthly},
      zillow_zpid = ${p.zillowZpid ?? null},
      crime_index = ${p.crimeIndex ?? null},
      initial_investment = ${p.initialInvestment ?? 0},
      closing_costs = ${p.closingCosts ?? 0},
      repair_costs = ${p.repairCosts ?? 0},
      mortgage_free = ${p.mortgageFree ?? false},
      purchased = ${p.purchased ?? false},
      year_purchased = ${p.yearPurchased ?? null},
      month_purchased = ${p.monthPurchased ?? null},
      current_rent_monthly = ${p.currentRentMonthly ?? null},
      current_insurance_annual = ${p.currentInsuranceAnnual ?? null},
      current_county_tax_rate = ${p.currentCountyTaxRate ?? null},
      current_city_tax_rate = ${p.currentCityTaxRate ?? null},
      current_appraisal_value = ${p.currentAppraisalValue ?? null},
      current_expenses_annual = ${p.currentExpensesAnnual ?? null},
      current_management_pct = ${p.currentManagementPct ?? null},
      current_hoa_monthly = ${p.currentHoaMonthly ?? null},
      current_market_value = ${p.currentMarketValue ?? null},
      market_value_updated_at = ${p.marketValueUpdatedAt ?? null},
      assessment_percentage = ${p.assessmentPercentage ?? 25},
      bedrooms = ${p.bedrooms ?? null},
      bathrooms = ${p.bathrooms ?? null},
      square_footage = ${p.squareFootage ?? null},
      year_built = ${p.yearBuilt ?? null},
      current_mortgage_balance = ${p.currentMortgageBalance ?? null},
      current_mortgage_rate = ${p.currentMortgageRate ?? null},
      current_mortgage_payment = ${p.currentMortgagePayment ?? null},
      current_mortgage_term_remaining = ${p.currentMortgageTermRemaining ?? null},
      abbreviation = ${p.abbreviation ?? null},
      county_tax_website = ${p.countyTaxWebsite ?? null},
      city_tax_website = ${p.cityTaxWebsite ?? null},
      notes = ${p.notes ?? null}
    WHERE id = ${id}
    RETURNING *;
  `;
  return rows[0];
}

// run on demand to ensure tables exist (safe to call on cold start)
export async function init() {
  await sql/*sql*/`
    CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      zip TEXT,
      purchase_price NUMERIC NOT NULL,
      down_payment_pct NUMERIC NOT NULL,
      interest_apr_pct NUMERIC NOT NULL,
      loan_years INT NOT NULL,
      monthly_rent NUMERIC NOT NULL,
      property_tax_pct NUMERIC NOT NULL,
      hoa_monthly NUMERIC NOT NULL,
      insurance_monthly NUMERIC NOT NULL,
      maintenance_pct_rent NUMERIC NOT NULL,
      vacancy_pct_rent NUMERIC NOT NULL,
      management_pct_rent NUMERIC NOT NULL,
      other_monthly NUMERIC NOT NULL,
      zillow_zpid TEXT,
      crime_index NUMERIC,
      deleted_at TIMESTAMPTZ,
      deleted_by TEXT,
      deleted_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;

  // ensure columns exist if table was created previously without soft-delete fields
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS deleted_by TEXT;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS deleted_reason TEXT;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS purchased BOOLEAN DEFAULT false;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_purchased INT;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS month_purchased INT;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS mortgage_free BOOLEAN DEFAULT false;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS mortgage_payoff_date DATE;`;

  // Current values tracking (separate from historical data)
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_rent_monthly NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_insurance_annual NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_county_tax_rate NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_city_tax_rate NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_appraisal_value NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_expenses_annual NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_management_pct NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_hoa_monthly NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_market_value NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS market_value_updated_at TIMESTAMPTZ;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS assessment_percentage NUMERIC DEFAULT 25;`;
  
  // Property characteristics
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS bedrooms INT;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS bathrooms NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS square_footage INT;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS year_built INT;`;
  
  // Current mortgage tracking (for properties with mortgages)
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_mortgage_balance NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_mortgage_rate NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_mortgage_payment NUMERIC;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS current_mortgage_term_remaining INT;`;

  // Property abbreviation for chart display
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS abbreviation TEXT;`;
  
  // Property tax input mode and annual amount
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS tax_annual NUMERIC DEFAULT 0;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS tax_input_mode TEXT DEFAULT 'percentage';`;
  
  // Tax website links and notes
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS county_tax_website TEXT;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS city_tax_website TEXT;`;
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS notes TEXT;`;
  
  // Archive functionality
  await sql/*sql*/`ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;`;

  await sql/*sql*/`
    CREATE TABLE IF NOT EXISTS property_actuals (
      id SERIAL PRIMARY KEY,
      property_id INT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      year INT NOT NULL,
      gross_income NUMERIC NOT NULL,
      total_expenses NUMERIC NOT NULL,
      depreciation NUMERIC NOT NULL DEFAULT 0,
      UNIQUE(property_id, year)
    );
  `;

  await sql`
    ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS initial_investment NUMERIC NOT NULL DEFAULT 0;
  `;

  await sql`
    ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS closing_costs NUMERIC DEFAULT 0;
  `;

  await sql`
    ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS repair_costs NUMERIC DEFAULT 0;
  `;

  // Create scenarios table for mortgage comparison scenarios
  await sql/*sql*/`
    CREATE TABLE IF NOT EXISTS property_scenarios (
      id SERIAL PRIMARY KEY,
      property_id INT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      down_pct NUMERIC NOT NULL,
      rate_apr NUMERIC NOT NULL,
      years INT NOT NULL,
      points NUMERIC DEFAULT 0,
      closing_costs NUMERIC DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT now(),
      UNIQUE(property_id, name)
    );
  `;

}

export async function listProperties(limit = 100) {
  const { rows } = await sql/*sql*/`
    SELECT * FROM properties
    WHERE deleted_at IS NULL AND archived_at IS NULL
    ORDER BY created_at DESC
    LIMIT ${limit};
  `;
  return rows;
}

export async function getPropertiesByIds(ids = []) {
  if (!ids.length) return [];
  const { rows } = await sql/*sql*/`
    SELECT * FROM properties
    WHERE id = ANY(${ids}) AND deleted_at IS NULL AND archived_at IS NULL
    ORDER BY created_at DESC;
  `;
  return rows;
}

export async function addProperty(p) {
  const { rows } = await sql/*sql*/`
    INSERT INTO properties (
      address, city, state, zip,
      purchase_price, down_payment_pct, interest_apr_pct, loan_years,
      monthly_rent, property_tax_pct, tax_annual, tax_input_mode, hoa_monthly, insurance_monthly,
      maintenance_pct_rent, vacancy_pct_rent, management_pct_rent, other_monthly,
      zillow_zpid, crime_index, purchased, year_purchased, month_purchased, initial_investment, closing_costs, repair_costs, mortgage_free,
      bedrooms, bathrooms, square_footage, year_built, abbreviation,
      county_tax_website, city_tax_website, notes
    ) VALUES (
      ${p.address}, ${p.city}, ${p.state}, ${p.zip},
      ${p.purchasePrice}, ${p.downPct}, ${p.rateApr}, ${p.years},
      ${p.monthlyRent}, ${p.taxPct}, ${p.taxAnnual ?? 0}, ${p.taxInputMode ?? 'percentage'}, ${p.hoaMonthly}, ${p.insuranceMonthly},
      ${p.maintPctRent}, ${p.vacancyPctRent}, ${p.mgmtPctRent}, ${p.otherMonthly},
      ${p.zillowZpid ?? null}, ${p.crimeIndex ?? null}, ${p.purchased ?? false}, ${p.yearPurchased ?? null}, ${p.monthPurchased ?? null},
      ${p.initialInvestment ?? 0}, ${p.closingCosts ?? 0}, ${p.repairCosts ?? 0}, ${p.mortgageFree ?? false},
      ${p.bedrooms ?? null}, ${p.bathrooms ?? null}, ${p.squareFootage ?? null}, ${p.yearBuilt ?? null}, ${p.abbreviation ?? null},
      ${p.countyTaxWebsite ?? null}, ${p.cityTaxWebsite ?? null}, ${p.notes ?? null}
    ) RETURNING *;
  `;
  return rows[0];
}

export async function deletePropertyYear(propertyId, year) {
  const { rows } = await sql/*sql*/`
    DELETE FROM property_actuals
    WHERE property_id = ${propertyId} AND year = ${year}
    RETURNING *;
  `;
  return rows[0];
}

// soft-delete: mark a property deleted instead of removing it
export async function softDeleteProperty(id, opts = {}) {
  const { rows } = await sql/*sql*/`
    UPDATE properties
    SET deleted_at = now(),
        deleted_by = ${opts.deletedBy ?? null},
        deleted_reason = ${opts.deletedReason ?? null}
    WHERE id = ${id}
    RETURNING *;
  `;
  return rows[0];
}

export async function restoreProperty(id) {
  const { rows } = await sql/*sql*/`
    UPDATE properties
    SET deleted_at = NULL, deleted_by = NULL, deleted_reason = NULL
    WHERE id = ${id}
    RETURNING *;
  `;
  return rows[0];
}

// hard delete (permanent) — for admin use only
export async function hardDeleteProperty(id) {
  const { rows } = await sql/*sql*/`
    DELETE FROM properties WHERE id = ${id} RETURNING *;
  `;
  return rows[0];
}

export async function listDeletedProperties(limit = 200) {
  const { rows } = await sql/*sql*/`
    SELECT * FROM properties
    WHERE deleted_at IS NOT NULL
    ORDER BY deleted_at DESC
    LIMIT ${limit};
  `;
  return rows;
}

// Archive/Unarchive functions
export async function archiveProperty(id) {
  const { rows } = await sql/*sql*/`
    UPDATE properties SET archived_at = now()
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *;
  `;
  return rows[0];
}

export async function unarchiveProperty(id) {
  const { rows } = await sql/*sql*/`
    UPDATE properties SET archived_at = NULL
    WHERE id = ${id} AND deleted_at IS NULL
    RETURNING *;
  `;
  return rows[0];
}

export async function listArchivedProperties(limit = 200) {
  const { rows } = await sql/*sql*/`
    SELECT * FROM properties
    WHERE archived_at IS NOT NULL AND deleted_at IS NULL
    ORDER BY archived_at DESC
    LIMIT ${limit};
  `;
  return rows;
}

export async function addActualsBulk(rows) {
  // rows: [{ propertyId, year, grossIncome, totalExpenses, depreciation }]
  if (!rows || rows.length === 0) return;

  // chunk the rows to avoid huge single statements and to isolate failures
  const maxParams = 65535; // Postgres parameter limit
  const paramsPerRow = 5; // Each row has 5 parameters (propertyId, year, grossIncome, totalExpenses, depreciation)
  const maxRowsPerChunk = Math.floor(maxParams / paramsPerRow);
  const chunkSize = Math.min(500, maxRowsPerChunk); // Adjust chunk size dynamically

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = chunk.map((_, idx) => `($${idx * paramsPerRow + 1}, $${idx * paramsPerRow + 2}, $${idx * paramsPerRow + 3}, $${idx * paramsPerRow + 4}, $${idx * paramsPerRow + 5})`).join(', ');
    const params = chunk.flatMap(r => [r.propertyId, r.year, r.grossIncome, r.totalExpenses, r.depreciation ?? 0]);
    const query = `
      INSERT INTO property_actuals (property_id, year, gross_income, total_expenses, depreciation)
      VALUES ${placeholders}
      ON CONFLICT (property_id, year) DO UPDATE
      SET gross_income = EXCLUDED.gross_income,
          total_expenses = EXCLUDED.total_expenses,
          depreciation = EXCLUDED.depreciation;
    `;
    try {
      console.debug('Executing multi-row insert:', { query, params });
      await sql.query(query, params);
    } catch (err) {
      console.error(`addActualsBulk: failed at chunk starting index ${i}`, { chunkLength: chunk.length, sample: chunk.slice(0, 3), error: err.message });
      err._bulkContext = { chunkStartIndex: i, chunkLength: chunk.length, sample: chunk.slice(0, 3) };
      throw err;
    }
  }
}

export async function getActuals(propertyId) {
  const { rows } = await sql`SELECT * FROM property_actuals WHERE property_id=${propertyId} ORDER BY year;`;
  return rows;
}

export async function getActualsForState(state) {
  const { rows } = await sql`
    SELECT pa.*, p.address, p.state
    FROM property_actuals pa
    JOIN properties p ON p.id = pa.property_id
    WHERE p.state = ${state}
    ORDER BY p.id, pa.year;
  `;
  return rows;
}

export async function listPropertyActuals(propertyId) {
  const { rows: actuals } = await sql/*sql*/`
    SELECT year, gross_income AS income, total_expenses AS expenses, depreciation
    FROM property_actuals
    WHERE property_id = ${propertyId}
    ORDER BY year ASC;
  `;
  return actuals;
}

export async function addPropertyActual(propertyId, yearData) {
  // Only update fields that are explicitly provided (not undefined/null)
  const income = yearData.income !== undefined ? Number(yearData.income) : null;
  const expenses = yearData.expenses !== undefined ? Number(yearData.expenses) : null;
  const depreciation = yearData.depreciation !== undefined ? Number(yearData.depreciation) : null;

  const { rows } = await sql/*sql*/`
    INSERT INTO property_actuals (property_id, year, gross_income, total_expenses, depreciation)
    VALUES (${propertyId}, ${yearData.year}, ${income ?? 0}, ${expenses ?? 0}, ${depreciation ?? 0})
    ON CONFLICT (property_id, year) DO UPDATE
    SET gross_income = CASE WHEN ${income} IS NOT NULL THEN ${income} ELSE property_actuals.gross_income END,
        total_expenses = CASE WHEN ${expenses} IS NOT NULL THEN ${expenses} ELSE property_actuals.total_expenses END,
        depreciation = CASE WHEN ${depreciation} IS NOT NULL THEN ${depreciation} ELSE property_actuals.depreciation END
    RETURNING *;
  `;
  return rows[0];
}

// Property Scenarios CRUD Functions
export async function addScenario(propertyId, scenario) {
  const { rows } = await sql/*sql*/`
    INSERT INTO property_scenarios (
      property_id, name, down_pct, rate_apr, years, points, closing_costs
    ) VALUES (
      ${propertyId}, ${scenario.name}, ${scenario.downPct}, ${scenario.rateApr}, 
      ${scenario.years}, ${scenario.points ?? 0}, ${scenario.closingCosts ?? 0}
    ) RETURNING *;
  `;
  return rows[0];
}

export async function getScenarios(propertyId) {
  const { rows } = await sql/*sql*/`
    SELECT * FROM property_scenarios 
    WHERE property_id = ${propertyId}
    ORDER BY created_at DESC;
  `;
  return rows;
}

export async function updateScenario(scenarioId, scenario) {
  const { rows } = await sql/*sql*/`
    UPDATE property_scenarios SET
      name = ${scenario.name},
      down_pct = ${scenario.downPct},
      rate_apr = ${scenario.rateApr},
      years = ${scenario.years},
      points = ${scenario.points ?? 0},
      closing_costs = ${scenario.closingCosts ?? 0}
    WHERE id = ${scenarioId}
    RETURNING *;
  `;
  return rows[0];
}

export async function deleteScenario(scenarioId) {
  const { rows } = await sql/*sql*/`
    DELETE FROM property_scenarios WHERE id = ${scenarioId} RETURNING *;
  `;
  return rows[0];
}

export async function getAllScenarios() {
  const { rows } = await sql/*sql*/`
    SELECT ps.*, p.address, p.city, p.state, p.abbreviation,
           p.down_payment_pct as base_down_pct, 
           p.interest_apr_pct as base_apr, 
           p.loan_years as base_loan_years
    FROM property_scenarios ps
    JOIN properties p ON p.id = ps.property_id
    WHERE p.deleted_at IS NULL
    ORDER BY p.id, ps.created_at DESC;
  `;
  return rows;
}

