export const DEFAULTS = {
  downPct: 25, rateApr: 6.4, loanYears: 30,
  closingCostsPct: 1.75, repairCosts: 10000,
  taxPct: 2.3, insuranceMonthly: 150,
  maintPctRent: 5, vacancyPctRent: 5, mgmtPctRent: 8,
  rentPerSqft: 1.00,
};

export function calcM(listing, mark, A = DEFAULTS) {
  const price = Number(listing.price);
  const hoa = mark?.hoa_quarterly != null ? mark.hoa_quarterly / 3 : 0;
  const rep = Number(mark?.repair_costs ?? A.repairCosts);
  // Cap sqft-based fallback at 8,000 sqft to guard against corrupt data
  const sqftSafe = listing.sqft && listing.sqft <= 8000 ? listing.sqft : null;
  const rentBase = mark?.rent_override
    || (mark?.rent_min != null && mark?.rent_max != null ? Math.round((Number(mark.rent_min) + Number(mark.rent_max)) / 2) : null)
    || (mark?.rent_min != null ? Number(mark.rent_min) : mark?.rent_max != null ? Number(mark.rent_max) : null)
    || (sqftSafe ? Math.round(sqftSafe * A.rentPerSqft) : 0);
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
//   2 debt investors  × (price × 2/3 ÷ 2) each  → 7.23% APR, paid monthly from rents
//   1 silent equity   × (price × 1/3 ÷ 2)        → share of sale proceeds
//   1 managing equity × (price × 1/3 ÷ 2)        → same equity + management fee income
// Total raise = purchase price + closing costs + repairs (covered by equity investors)
// debtRate = 30yr fixed (6.23% as of 2026-04-23, Freddie Mac) + 1% lender premium
export const GROUP_DEFAULTS = {
  debtRate:      0.0723, // 7.23% APR to debt investors (30yr fixed 6.23% + 1%)
  debtRatio:     0.75,   // debt investors fund 75% of price
  saleCostPct:   0.06,   // selling costs at exit
  holdYears:     5,
  appRate:       0.03,   // 3% annual appreciation
  mgrEquityShare: 0.55,  // manager gets 55% of equity proceeds/CF; silent equity gets 45%
};

// Helper: compute equity and manager ROIs for a given appreciation rate
function _exitROIs(price, appRate, G, equityCFMo, perEquityInvestor) {
  const salePrice    = price * Math.pow(1 + appRate, G.holdYears);
  const saleCosts    = salePrice * G.saleCostPct;
  const netAfterDebt = salePrice - saleCosts - price * G.debtRatio;
  const silentShare  = 1 - G.mgrEquityShare;

  const silentProceeds = netAfterDebt * silentShare;
  const silentCF5yr    = equityCFMo * G.holdYears * 12 * silentShare;
  const silentTotal    = silentProceeds + silentCF5yr;
  const eqRaw = perEquityInvestor > 0
    ? (silentTotal - perEquityInvestor) / perEquityInvestor / G.holdYears * 100
    : null;

  const mgrProceeds = netAfterDebt * G.mgrEquityShare;
  const mgrCF5yr    = equityCFMo * G.holdYears * 12 * G.mgrEquityShare;
  const mgrTotal    = mgrProceeds + mgrCF5yr;
  const mgrRaw = perEquityInvestor > 0
    ? (mgrTotal - perEquityInvestor) / perEquityInvestor / G.holdYears * 100
    : null;

  return {
    equityROI5:  Number.isFinite(eqRaw)  ? Math.round(eqRaw  * 10) / 10 : null,
    managerROI5: Number.isFinite(mgrRaw) ? Math.round(mgrRaw * 10) / 10 : null,
    equityProfit:  Math.round(silentTotal - perEquityInvestor),
    mgrProfit:     Math.round(mgrTotal - perEquityInvestor),
    equityProceeds: Math.round(silentProceeds),
  };
}

export function calcGroup(listing, mark, A = DEFAULTS, G = GROUP_DEFAULTS, { fast = false } = {}) {
  const price = Number(listing.price);
  const hoa  = mark?.hoa_quarterly != null ? mark.hoa_quarterly / 3 : 0;
  const rep  = Number(mark?.repair_costs ?? A.repairCosts);
  const sqftSafe = listing.sqft && listing.sqft <= 8000 ? listing.sqft : null;
  const rentBase = mark?.rent_override
    || (mark?.rent_min != null && mark?.rent_max != null ? Math.round((Number(mark.rent_min) + Number(mark.rent_max)) / 2) : null)
    || (mark?.rent_min != null ? Number(mark.rent_min) : mark?.rent_max != null ? Number(mark.rent_max) : null)
    || (sqftSafe ? Math.round(sqftSafe * A.rentPerSqft) : 0);
  const rent = rentBase;
  if (!price || !rent) return null;

  // Capital structure
  const debtTotal          = price * G.debtRatio;
  const equityTotal        = price - debtTotal;
  const closingAndRepairs  = price * (A.closingCostsPct / 100) + rep;
  const perDebtInvestor    = Math.round(debtTotal / 2);
  const perEquityInvestor  = Math.round((equityTotal + closingAndRepairs) / 2);

  // Monthly debt interest paid from rents
  const debtInterestMo = debtTotal * G.debtRate / 12;

  // Operating expenses (no bank P&I — debt interest replaces it)
  const tax   = listing.tax_annual ? Number(listing.tax_annual) / 12 : (price * (A.taxPct / 100)) / 12;
  const ins   = A.insuranceMonthly;
  const mgmt  = rent * (A.mgmtPctRent / 100);
  const maint = rent * (A.maintPctRent / 100);
  const vac   = rent * (A.vacancyPctRent / 100);
  const opEx  = tax + hoa + ins + maint + vac + mgmt;

  // Monthly cash flow available to equity investors
  const equityCFMo = rent - debtInterestMo - opEx;

  // Compute ROIs: always at 3% (base); at0/at5 only when full scenarios needed
  const at3 = _exitROIs(price, 0.03, G, equityCFMo, perEquityInvestor);
  const at0 = fast ? null : _exitROIs(price, 0,    G, equityCFMo, perEquityInvestor);
  const at5 = fast ? null : _exitROIs(price, 0.05, G, equityCFMo, perEquityInvestor);

  // Debt investor total return (simple interest, 8% × 5yr)
  const debtReturn5yr = Math.round(perDebtInvestor * G.debtRate * G.holdYears);
  const debtAtSaleCompound  = Math.round(perDebtInvestor * (Math.pow(1 + G.debtRate, G.holdYears) - 1));
  const debtMonthlyVsAtSale = debtAtSaleCompound - debtReturn5yr;

  const mgmtFee5yr = Math.round(mgmt * 12 * G.holdYears);
  const debtROI5   = G.debtRate * 100;

  return {
    perDebtInvestor,
    perEquityInvestor,
    debtMo: Math.round(debtInterestMo / 2),
    debtReturn5yr,
    equityCFMo: Math.round(equityCFMo * (1 - G.mgrEquityShare)), // silent investor monthly CF
    // Base scenario (3% app) — used for sorting and legacy callers
    equityROI5:    at3.equityROI5,
    equityProfit:  at3.equityProfit,
    equityProceeds: at3.equityProceeds,
    managerROI5:   at3.managerROI5,
    mgrProfit:     at3.mgrProfit,
    mgrEquityShare: G.mgrEquityShare,
    debtROI5,
    mgmtFee5yr,
    debtMonthlyVsAtSale,
    // Appreciation scenarios for range display (null in fast/sort-only mode)
    scenarios: fast ? null : { at0, at3, at5 },
  };
}

// ── Promote-deal structures (Options A & C) ───────────────────────────────────
// Both use the same debt structure as calcGroup (75% at 7.23%).
// Equity investors are EQUAL partners during the hold (CF split 50/50).
// Manager advantage is purely an exit promote on profits above the hurdle rate.
// promoteRate: fraction of excess-above-hurdle that goes solely to the manager.
//   Option A: 0.20 (20% promote — subtler advantage)
//   Option C: 0.30 (30% promote — stronger manager reward)
function calcPromoteDeal(listing, mark, A, G, promoteRate, appRate = G.appRate) {
  const price = Number(listing.price);
  const hoa   = mark?.hoa_quarterly != null ? mark.hoa_quarterly / 3 : 0;
  const rep   = Number(mark?.repair_costs ?? A.repairCosts);
  const sqftSafe = listing.sqft && listing.sqft <= 8000 ? listing.sqft : null;
  const rent = mark?.rent_override
    || (mark?.rent_min != null && mark?.rent_max != null ? Math.round((Number(mark.rent_min) + Number(mark.rent_max)) / 2) : null)
    || (mark?.rent_min != null ? Number(mark.rent_min) : mark?.rent_max != null ? Number(mark.rent_max) : null)
    || (sqftSafe ? Math.round(sqftSafe * A.rentPerSqft) : 0);
  if (!price || !rent) return null;

  const debtTotal         = price * G.debtRatio;
  const equityTotal       = price - debtTotal;
  const closingAndRepairs = price * (A.closingCostsPct / 100) + rep;
  const totalEquity       = equityTotal + closingAndRepairs; // total equity raised
  const perEquityInvestor = Math.round(totalEquity / 2);    // 2 equal equity investors

  const debtInterestMo = debtTotal * G.debtRate / 12;
  const tax   = listing.tax_annual ? Number(listing.tax_annual) / 12 : (price * (A.taxPct / 100)) / 12;
  const opEx  = tax + hoa + A.insuranceMonthly
              + rent * (A.maintPctRent + A.vacancyPctRent + A.mgmtPctRent) / 100;
  const equityCFMo = rent - debtInterestMo - opEx;

  // Exit at given appreciation rate
  const salePrice    = price * Math.pow(1 + appRate, G.holdYears);
  const netAfterDebt = salePrice - salePrice * G.saleCostPct - debtTotal;

  const totalCF5         = equityCFMo * G.holdYears * 12;
  const totalEquityReturn = netAfterDebt + totalCF5;
  const totalProfit      = totalEquityReturn - totalEquity;

  // Hurdle: each investor must clear debtRate/yr before promote kicks in
  const hurdleTotal = totalEquity * G.debtRate * G.holdYears;

  let silentProfit, managerProfit;
  if (totalProfit >= hurdleTotal) {
    const excess = totalProfit - hurdleTotal;
    // Below hurdle: split 50/50; above hurdle: manager keeps promoteRate, rest 50/50
    silentProfit  = hurdleTotal / 2 + excess * (1 - promoteRate) / 2;
    managerProfit = hurdleTotal / 2 + excess * (1 - promoteRate) / 2 + excess * promoteRate;
  } else {
    silentProfit  = totalProfit / 2;
    managerProfit = totalProfit / 2;
  }

  const silentROI  = perEquityInvestor > 0 ? silentProfit  / perEquityInvestor / G.holdYears * 100 : null;
  const managerROI = perEquityInvestor > 0 ? managerProfit / perEquityInvestor / G.holdYears * 100 : null;
  const promoteKicked = totalProfit >= hurdleTotal;

  return {
    silentROI:        silentROI  != null ? Math.round(silentROI  * 10) / 10 : null,
    managerROI:       managerROI != null ? Math.round(managerROI * 10) / 10 : null,
    promoteKicked,
    perEquityInvestor,
    equityCFMo:       Math.round(equityCFMo),
  };
}

export function calcOptionA(listing, mark, A = DEFAULTS, G = GROUP_DEFAULTS) {
  // Equal equity partners + 20% exit promote above debt-rate hurdle
  const at3 = calcPromoteDeal(listing, mark, A, G, 0.20, 0.03);
  const at0 = calcPromoteDeal(listing, mark, A, G, 0.20, 0);
  const at5 = calcPromoteDeal(listing, mark, A, G, 0.20, 0.05);
  if (!at3) return null;
  return { ...at3, at0, at5, promoteRate: 0.20 };
}

export function calcOptionC(listing, mark, A = DEFAULTS, G = GROUP_DEFAULTS) {
  // Equal equity partners + 30% exit promote above debt-rate hurdle
  const at3 = calcPromoteDeal(listing, mark, A, G, 0.30, 0.03);
  const at0 = calcPromoteDeal(listing, mark, A, G, 0.30, 0);
  const at5 = calcPromoteDeal(listing, mark, A, G, 0.30, 0.05);
  if (!at3) return null;
  return { ...at3, at0, at5, promoteRate: 0.30 };
}
