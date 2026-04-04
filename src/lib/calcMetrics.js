export const DEFAULTS = {
  downPct: 25, rateApr: 6.4, loanYears: 30,
  closingCostsPct: 3, repairCosts: 5000,
  taxPct: 2.3, insuranceMonthly: 150,
  maintPctRent: 5, vacancyPctRent: 5, mgmtPctRent: 8,
  rentPerSqft: 1.00,
};

export function calcM(listing, mark, A = DEFAULTS) {
  const price = Number(listing.price);
  const hoa = mark?.hoa_quarterly != null ? mark.hoa_quarterly / 3 : 0;
  const rep = mark?.repair_costs ?? A.repairCosts;
  const rentBase = mark?.rent_override
    || (mark?.rent_min != null && mark?.rent_max != null ? Math.round((mark.rent_min + mark.rent_max) / 2) : null)
    || (mark?.rent_min ?? mark?.rent_max)
    || (listing.sqft ? Math.round(listing.sqft * A.rentPerSqft) : 0);
  const rent = rentBase;
  if (!price || !rent) return null;
  const down = price * (A.downPct / 100);
  const cc = price * (A.closingCostsPct / 100);
  const paid = down + cc + rep;
  const loan = price - down;
  const r = A.rateApr / 100 / 12, n = A.loanYears * 12;
  const pI = loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const tax = listing.tax_annual ? Number(listing.tax_annual) / 12 : (price * (A.taxPct / 100)) / 12;
  const ins = A.insuranceMonthly;
  const mgmt = rent * (A.mgmtPctRent / 100);
  const maint = rent * (A.maintPctRent / 100);
  const vac = rent * (A.vacancyPctRent / 100);
  const opEx = tax + hoa + ins + maint + vac + mgmt;
  const cf = Math.round(rent - (pI + opEx));
  const noi = rent - (opEx - vac);
  const capRaw = Math.round((noi * 12 / price) * 1000) / 10;
  const cap = Number.isFinite(capRaw) ? capRaw : null;
  const cocRaw = paid > 0 ? Math.round((cf * 12 / paid) * 1000) / 10 : null;
  const coc = Number.isFinite(cocRaw) ? cocRaw : null;
  const yrs = 30, eff = rent * (1 - A.vacancyPctRent / 100);
  const tv = price + eff * 12 * yrs;
  let te = paid + rent * 12 * (A.mgmtPctRent / 100) * yrs + pI * 12 * yrs + tax * 12 * yrs + rent * 12 * (A.maintPctRent / 100) * yrs + ins * 12 * yrs + hoa * 12 * yrs;
  const depr = (price + cc + rep + ins * 12) / 27.5 / 12;
  te += Math.max(0, (eff - rent * (A.mgmtPctRent / 100) - rent * (A.maintPctRent / 100) - ins - depr - tax) * 0.44) * 12 * yrs;
  const atroiRaw = paid > 0 ? Math.round(((tv - te) / paid / yrs) * 1000) / 10 : 0;
  const atroi = Number.isFinite(atroiRaw) && Math.abs(atroiRaw) <= 10000 ? atroiRaw : null;
  const atroiErr = Number.isFinite(atroiRaw) && Math.abs(atroiRaw) > 10000;
  // ── 5-year equity ROI (appreciation + principal paydown + cash flows) ───────
  const appRate = 0.03; // 3% annual appreciation assumption
  const appGain = price * (Math.pow(1 + appRate, 5) - 1);
  const pow60 = Math.pow(1 + r, 60), powN = Math.pow(1 + r, n);
  const balance5 = r > 0 ? loan * (powN - pow60) / (powN - 1) : loan - pI * 60;
  const principalPaid5 = loan - balance5;
  const cashFlow5 = cf * 12 * 5;
  const roi5Raw = paid > 0 ? Math.round(((appGain + principalPaid5 + cashFlow5) / paid / 5) * 1000) / 10 : null;
  const roi5 = Number.isFinite(roi5Raw) && Math.abs(roi5Raw) <= 10000 ? roi5Raw : null;
  // ── Rent % of total cost (1% rule variant) ──────────────────────────────────
  const totalCost = price + rep;
  const rentPctRaw = totalCost > 0 ? Math.round((rent / totalCost) * 10000) / 100 : null;
  const rentPct = Number.isFinite(rentPctRaw) ? rentPctRaw : null;
  return { cf, cap, coc, atroi, atroiErr, roi5, rent: Math.round(rent), rentPct };
}

// ── Group Deal: 5-person investor structure ───────────────────────────────────
// Structure (cash purchase — no bank mortgage):
//   2 debt investors  × (price × 2/3 ÷ 2) each  → 8% APR, paid monthly from rents
//   1 silent equity   × (price × 1/3 ÷ 2)        → share of sale proceeds
//   1 managing equity × (price × 1/3 ÷ 2)        → same equity + management fee income
// Total raise = purchase price + closing costs + repairs (covered by equity investors)
export const GROUP_DEFAULTS = {
  debtRate:    0.08,   // 8% APR to debt investors
  debtRatio:   2/3,    // debt investors fund 2/3 of price
  saleCostPct: 0.06,   // selling costs at exit
  holdYears:   5,
  appRate:     0.03,   // 3% annual appreciation
};

export function calcGroup(listing, mark, A = DEFAULTS, G = GROUP_DEFAULTS) {
  const price = Number(listing.price);
  const hoa  = mark?.hoa_quarterly != null ? mark.hoa_quarterly / 3 : 0;
  const rep  = mark?.repair_costs ?? A.repairCosts;
  const rentBase = mark?.rent_override
    || (mark?.rent_min != null && mark?.rent_max != null ? Math.round((mark.rent_min + mark.rent_max) / 2) : null)
    || (mark?.rent_min ?? mark?.rent_max)
    || (listing.sqft ? Math.round(listing.sqft * A.rentPerSqft) : 0);
  const rent = rentBase;
  if (!price || !rent) return null;

  // Capital structure
  const debtTotal          = price * G.debtRatio;
  const equityTotal        = price - debtTotal;               // equity covers price remainder
  const closingAndRepairs  = price * (A.closingCostsPct / 100) + rep;
  const perDebtInvestor    = Math.round(debtTotal / 2);       // 2 debt investors
  const perEquityInvestor  = Math.round((equityTotal + closingAndRepairs) / 2); // 2 equity investors cover closing/repairs too

  // Monthly debt interest paid from rents
  const debtInterestMo = debtTotal * G.debtRate / 12;

  // Operating expenses (no bank P&I — debt interest replaces it)
  const tax   = listing.tax_annual ? Number(listing.tax_annual) / 12 : (price * (A.taxPct / 100)) / 12;
  const ins   = A.insuranceMonthly;
  const mgmt  = rent * (A.mgmtPctRent / 100);
  const maint = rent * (A.maintPctRent / 100);
  const vac   = rent * (A.vacancyPctRent / 100);
  const opEx  = tax + hoa + ins + maint + vac + mgmt;

  // Monthly cash flow available to equity investors (split 50/50)
  const equityCFMo      = rent - debtInterestMo - opEx;
  const equityCF5yr     = equityCFMo * 12 * G.holdYears;
  const perEquityCFMo   = Math.round(equityCFMo / 2);

  // 5-year exit
  const salePrice          = price * Math.pow(1 + G.appRate, G.holdYears);
  const saleCosts          = salePrice * G.saleCostPct;
  const netAfterDebt       = salePrice - saleCosts - debtTotal; // to equity investors
  const perEquityProceeds  = Math.round(netAfterDebt / 2);      // each equity investor's sale share

  // Equity investor total 5yr return (cash flows + sale proceeds vs. cash invested)
  const perEquityTotal  = perEquityProceeds + Math.round(equityCF5yr / 2);
  const equityROI5Raw   = perEquityInvestor > 0
    ? (perEquityTotal - perEquityInvestor) / perEquityInvestor / G.holdYears * 100
    : null;
  const equityROI5 = Number.isFinite(equityROI5Raw) ? Math.round(equityROI5Raw * 10) / 10 : null;

  // Debt investor total return (simple interest, 8% × 5yr)
  const debtReturn5yr = Math.round(perDebtInvestor * G.debtRate * G.holdYears);

  // At-sale compound comparison (extra earned vs. monthly simple)
  const debtAtSaleCompound = Math.round(perDebtInvestor * (Math.pow(1 + G.debtRate, G.holdYears) - 1));
  const debtMonthlyVsAtSale = debtAtSaleCompound - debtReturn5yr; // extra if compound at-sale

  // Manager extra: management fee income over 5yr (on top of equal equity share)
  const mgmtFee5yr = Math.round(mgmt * 12 * G.holdYears);

  // Manager ROI: same equity return + management fee income on top
  const mgrTotalReturn  = perEquityProceeds + Math.round(equityCF5yr / 2) + mgmtFee5yr;
  const mgrROI5Raw      = perEquityInvestor > 0
    ? (mgrTotalReturn - perEquityInvestor) / perEquityInvestor / G.holdYears * 100
    : null;
  const managerROI5 = Number.isFinite(mgrROI5Raw) ? Math.round(mgrROI5Raw * 10) / 10 : null;

  // Debt ROI is always the fixed rate
  const debtROI5 = G.debtRate * 100;

  return {
    perDebtInvestor,
    perEquityInvestor,
    debtMo: Math.round(debtInterestMo / 2),
    debtReturn5yr,
    equityCFMo: perEquityCFMo,
    equityProceeds: perEquityProceeds,
    equityROI5,
    managerROI5,
    debtROI5,
    mgmtFee5yr,
    debtMonthlyVsAtSale,
  };
}
