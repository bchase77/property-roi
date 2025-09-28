import { sql } from '@vercel/postgres';

export async function updateProperty(id, p) {
  const { rows } = await sql/*sql*/`
    UPDATE properties SET
      address = ${p.address},
      city = ${p.city},
      state = ${p.state},
      zip = ${p.zip},
      purchase_price = ${p.purchasePrice},
      down_payment_pct = ${p.downPct},
      interest_apr_pct = ${p.rateApr},
      loan_years = ${p.years},
      monthly_rent = ${p.monthlyRent},
      property_tax_pct = ${p.taxPct},
      hoa_monthly = ${p.hoaMonthly},
      insurance_monthly = ${p.insuranceMonthly},
      maintenance_pct_rent = ${p.maintPctRent},
      vacancy_pct_rent = ${p.vacancyPctRent},
      management_pct_rent = ${p.mgmtPctRent},
      other_monthly = ${p.otherMonthly},
      zillow_zpid = ${p.zillowZpid ?? null},
      crime_index = ${p.crimeIndex ?? null}
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
      created_at TIMESTAMPTZ DEFAULT now()
    );
  `;
}

export async function listProperties(limit = 100) {
  const { rows } = await sql/*sql*/`
    SELECT * FROM properties ORDER BY created_at DESC LIMIT ${limit};
  `;
  return rows;
}

export async function getPropertiesByIds(ids = []) {
  if (!ids.length) return [];
  const { rows } = await sql/*sql*/`
    SELECT * FROM properties WHERE id = ANY(${ids}) ORDER BY created_at DESC;
  `;
  return rows;
}

export async function addProperty(p) {
  const { rows } = await sql/*sql*/`
    INSERT INTO properties (
      address, city, state, zip,
      purchase_price, down_payment_pct, interest_apr_pct, loan_years,
      monthly_rent, property_tax_pct, hoa_monthly, insurance_monthly,
      maintenance_pct_rent, vacancy_pct_rent, management_pct_rent, other_monthly,
      zillow_zpid, crime_index
    ) VALUES (
      ${p.address}, ${p.city}, ${p.state}, ${p.zip},
      ${p.purchasePrice}, ${p.downPct}, ${p.rateApr}, ${p.years},
      ${p.monthlyRent}, ${p.taxPct}, ${p.hoaMonthly}, ${p.insuranceMonthly},
      ${p.maintPctRent}, ${p.vacancyPctRent}, ${p.mgmtPctRent}, ${p.otherMonthly},
      ${p.zillowZpid ?? null}, ${p.crimeIndex ?? null}
    ) RETURNING *;
  `;
  return rows[0];
}

