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
  return { cf, cap, coc, atroi, atroiErr, roi5, rent: Math.round(rent) };
}
