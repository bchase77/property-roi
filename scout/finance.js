// Standalone finance calculations for Scout — ported from src/lib/finance.js
// No React, no console spam, no UI dependencies.

export const ASSUMPTIONS = {
  downPct: 25,          // % down payment
  rateApr: 6.4,         // annual interest rate
  loanYears: 30,        // loan term
  closingCostsPct: 3,   // % of purchase price
  repairCosts: 5000,    // one-time repair budget
  taxPct: 2.1,          // Texas property tax %
  insuranceMonthly: 150,
  maintPctRent: 5,      // maintenance as % of rent
  vacancyPctRent: 5,    // vacancy as % of rent
  mgmtPctRent: 8,       // management as % of rent
  rentPerSqft: 1.00,    // $/sqft/month for rent estimation
  hoaMonthly: 0,
  otherMonthly: 0,
};

function mortgageMonthly(principal, aprPct, years) {
  const r = aprPct / 100 / 12;
  const n = years * 12;
  if (!r) return principal / n;
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

export function estimateRent(sqft, rentPerSqft = ASSUMPTIONS.rentPerSqft) {
  if (!sqft || sqft <= 0) return null;
  return Math.round(sqft * rentPerSqft);
}

/**
 * Full metrics calculation for a prospective property.
 * @param {object} p
 * @param {number} p.price         - Purchase price
 * @param {number} p.monthlyRent   - Monthly rent (actual or estimated)
 * @param {number} p.sqft          - Square footage (used only if monthlyRent is null)
 * @param {number} [p.hoaMonthly]  - HOA monthly (from listing if available)
 * @param {object} [overrides]     - Override any ASSUMPTIONS fields
 * @returns {object} metrics
 */
export function calculateMetrics(p, overrides = {}) {
  const a = { ...ASSUMPTIONS, ...overrides };

  const price = Number(p.price) || 0;
  const rent = p.monthlyRent != null ? Number(p.monthlyRent) : estimateRent(p.sqft, a.rentPerSqft);
  const hoa = Number(p.hoaMonthly ?? a.hoaMonthly);

  if (!price || !rent) return null;

  const down = price * (a.downPct / 100);
  const closingCosts = price * (a.closingCostsPct / 100);
  const repairs = a.repairCosts || 0;
  const amountPaid = down + closingCosts + repairs;

  const loan = price - down;
  const pAndI = mortgageMonthly(loan, a.rateApr, a.loanYears);
  const taxesMonthly = (price * (a.taxPct / 100)) / 12;
  const insurance = a.insuranceMonthly;

  const mgmt = rent * (a.mgmtPctRent / 100);
  const maint = rent * (a.maintPctRent / 100);
  const vacancy = rent * (a.vacancyPctRent / 100);

  const operatingExpenses = taxesMonthly + hoa + insurance + maint + vacancy + mgmt + (a.otherMonthly || 0);
  const cashflowMonthly = rent - (pAndI + operatingExpenses);
  const noiMonthly = rent - (operatingExpenses - vacancy);
  const noiAnnual = noiMonthly * 12;
  const capRate = (noiAnnual / price) * 100;
  const cashOnCash = amountPaid > 0 ? ((cashflowMonthly * 12) / amountPaid) * 100 : null;
  const grossYield = (rent * 12 / price) * 100;
  const dscr = pAndI ? (noiMonthly / pAndI) : Infinity;

  // ── 30y ATROI ── (user's exact formula, clean version)
  const years = 30;
  const effectiveRent = rent * (1 - a.vacancyPctRent / 100);
  const incomeFor30y = effectiveRent * 12 * years;
  const totalValue = price + incomeFor30y;

  let totalExpenses = amountPaid;
  totalExpenses += rent * 12 * (a.mgmtPctRent / 100) * years;         // management
  totalExpenses += pAndI * 12 * years;                                  // mortgage
  totalExpenses += taxesMonthly * 12 * years;                           // property tax
  totalExpenses += rent * 12 * (a.maintPctRent / 100) * years;          // maintenance
  totalExpenses += insurance * 12 * years;                               // insurance
  totalExpenses += hoa * 12 * years;                                     // HOA

  // Income tax (44% combined rate, with depreciation shield)
  const depreciableBasis = price + closingCosts + repairs + (insurance * 12);
  const monthlyDepreciation = (depreciableBasis / 27.5) / 12;
  const monthlyTaxable = effectiveRent
    - rent * (a.mgmtPctRent / 100)
    - rent * (a.maintPctRent / 100)
    - insurance
    - monthlyDepreciation
    - taxesMonthly;
  const monthlyIncomeTax = Math.max(0, monthlyTaxable * 0.44);
  totalExpenses += monthlyIncomeTax * 12 * years;

  const atROI30y = amountPaid > 0 ? ((totalValue - totalExpenses) / amountPaid / years) * 100 : 0;

  return {
    price,
    rent,
    amountPaid,
    pAndI: Math.round(pAndI),
    taxesMonthly: Math.round(taxesMonthly),
    cashflowMonthly: Math.round(cashflowMonthly),
    capRate: Math.round(capRate * 10) / 10,
    cashOnCash: cashOnCash != null ? Math.round(cashOnCash * 10) / 10 : null,
    grossYield: Math.round(grossYield * 10) / 10,
    dscr: Math.round(dscr * 100) / 100,
    atROI30y: Math.round(atROI30y * 10) / 10,
  };
}
