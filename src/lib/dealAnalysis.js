/**
 * dealAnalysis.js
 * Pure calculation library for private-capital deal structuring.
 * No React, no side effects — import anywhere.
 */

/**
 * @typedef {Object} DealInputs
 * @property {string}  address
 * @property {number}  purchasePrice
 * @property {number}  repairCosts
 * @property {number}  reserveFund
 * @property {number}  monthlyRent
 * @property {number}  taxPct              - annual property tax as % of purchase price
 * @property {number}  insuranceMonthly
 * @property {number}  maintPctRent        - maintenance as % of gross rent
 * @property {number}  vacancyPctRent      - vacancy as % of gross rent
 * @property {number}  mgmtPctRent         - management as % of gross rent
 * @property {number}  hoaMonthly
 * @property {number}  equityCount         - number of equity investors
 * @property {number}  equityPerInvestor   - dollars per equity investor
 * @property {number}  debtCount           - number of debt lenders
 * @property {number}  debtPerInvestor     - dollars per debt lender
 * @property {number}  debtRatePct         - annual interest rate on private debt
 */

/**
 * Core deal calculator.
 * @param {DealInputs} inputs
 * @returns {Object} dealResult
 */
export function calcDeal(inputs) {
  const {
    purchasePrice = 0,
    repairCosts = 0,
    reserveFund = 0,
    monthlyRent = 0,
    taxPct = 0,
    insuranceMonthly = 0,
    maintPctRent = 0,
    vacancyPctRent = 0,
    mgmtPctRent = 0,
    hoaMonthly = 0,
    equityCount = 0,
    equityPerInvestor = 0,
    debtCount = 0,
    debtPerInvestor = 0,
    debtRatePct = 0,
  } = inputs;

  // ── Capital stack ──────────────────────────────────────────────
  const totalEquity = equityCount * equityPerInvestor;
  const totalDebt = debtCount * debtPerInvestor;
  const totalRaise = totalEquity + totalDebt;
  const totalNeed = purchasePrice + repairCosts + reserveFund;
  const surplus = totalRaise - totalNeed;

  // ── Debt service (interest-only on private debt) ───────────────
  const monthlyDebtService = (totalDebt * (debtRatePct / 100)) / 12;

  // ── Monthly revenue ────────────────────────────────────────────
  const grossRent = monthlyRent;
  const vacancyLoss = grossRent * (vacancyPctRent / 100);
  const effectiveRent = grossRent - vacancyLoss;

  // ── Monthly operating expenses ─────────────────────────────────
  const taxesMonthly = (purchasePrice * (taxPct / 100)) / 12;
  const maintenanceMonthly = grossRent * (maintPctRent / 100);
  const managementMonthly = grossRent * (mgmtPctRent / 100);
  // insuranceMonthly and hoaMonthly come straight from inputs

  // totalOpEx includes vacancy loss so it represents all cash going out
  const totalOpEx =
    vacancyLoss +
    taxesMonthly +
    maintenanceMonthly +
    managementMonthly +
    insuranceMonthly +
    hoaMonthly;

  // Standard NOI excludes vacancy (uses effectiveRent) and excludes debt service
  const noiMonthly =
    effectiveRent - (taxesMonthly + maintenanceMonthly + managementMonthly + insuranceMonthly + hoaMonthly);

  // Equity cash flow = all revenue minus ALL operating costs minus debt service
  const equityCashFlow = grossRent - totalOpEx - monthlyDebtService;
  const equityCashFlowPerInvestor =
    equityCount > 0 ? equityCashFlow / equityCount : 0;

  // ── Returns ────────────────────────────────────────────────────
  const equityCoC =
    totalEquity > 0 ? ((equityCashFlow * 12) / totalEquity) * 100 : 0;

  const debtAnnualIncomeTotal = totalDebt * (debtRatePct / 100);
  const debtAnnualIncomePerInvestor =
    debtCount > 0 ? debtAnnualIncomeTotal / debtCount : 0;

  const debtCoverage =
    monthlyDebtService > 0 ? noiMonthly / monthlyDebtService : null;

  // Break-even rent: solve for R where R - totalOpEx(R) - monthlyDebtService = 0
  // totalOpEx includes vacancyPct, maintPct, mgmtPct of grossRent
  // opExVariableRate = vacancyPctRent/100 + maintPctRent/100 + mgmtPctRent/100
  const variableOpExRate =
    (vacancyPctRent + maintPctRent + mgmtPctRent) / 100;
  const fixedOpEx = taxesMonthly + insuranceMonthly + hoaMonthly;
  // R * (1 - variableOpExRate) = fixedOpEx + monthlyDebtService
  const breakEvenRent =
    1 - variableOpExRate > 0
      ? (fixedOpEx + monthlyDebtService) / (1 - variableOpExRate)
      : null;

  return {
    // Capital
    totalEquity,
    totalDebt,
    totalRaise,
    totalNeed,
    surplus,
    // Debt service
    monthlyDebtService,
    // Revenue
    grossRent,
    vacancyLoss,
    effectiveRent,
    // Expenses (monthly)
    taxesMonthly,
    maintenanceMonthly,
    managementMonthly,
    insuranceMonthly,
    hoaMonthly,
    totalOpEx,
    // P&L
    noiMonthly,
    equityCashFlow,
    equityCashFlowPerInvestor,
    // Returns
    equityCoC,
    debtAnnualIncomeTotal,
    debtAnnualIncomePerInvestor,
    debtCoverage,
    breakEvenRent,
    // Per investor convenience
    equityInvestment: equityPerInvestor,
    debtInvestment: debtPerInvestor,
  };
}

/**
 * 5-year (or N-year) projection table.
 * Assumes 3% annual property appreciation, 2.5% annual rent growth.
 *
 * @param {DealInputs} inputs
 * @param {Object}     dealResult  - output of calcDeal(inputs)
 * @param {number}     years       - projection horizon (default 5)
 * @returns {Array<Object>} year-by-year rows
 */
export function calcProjections(inputs, dealResult, years = 5) {
  const APPRECIATION = 0.03;
  const RENT_GROWTH = 0.025;

  const {
    purchasePrice = 0,
    equityCount = 1,
    debtCount = 1,
    debtRatePct = 0,
    vacancyPctRent = 0,
    maintPctRent = 0,
    mgmtPctRent = 0,
    taxPct = 0,
    insuranceMonthly = 0,
    hoaMonthly = 0,
  } = inputs;

  const { totalEquity, totalDebt, monthlyDebtService } = dealResult;

  const rows = [];
  let cumulEquityCFPerInvestor = 0;
  let cumulDebtIncomePerInvestor = 0;

  for (let y = 1; y <= years; y++) {
    const propValue = purchasePrice * Math.pow(1 + APPRECIATION, y);
    const equityTotal = propValue - totalDebt; // debt is fixed (interest-only)
    const equityPerInvestor = equityCount > 0 ? equityTotal / equityCount : 0;

    // Rent grows each year
    const annualRent = inputs.monthlyRent * 12 * Math.pow(1 + RENT_GROWTH, y - 1);
    const monthlyRentY = annualRent / 12;

    // Recalculate cash flow at year-y rent
    const vacancyLossY = monthlyRentY * (vacancyPctRent / 100);
    const maintY = monthlyRentY * (maintPctRent / 100);
    const mgmtY = monthlyRentY * (mgmtPctRent / 100);
    const taxY = (purchasePrice * (taxPct / 100)) / 12;
    const totalOpExY =
      vacancyLossY + taxY + maintY + mgmtY + insuranceMonthly + hoaMonthly;

    const monthlyEquityCF = monthlyRentY - totalOpExY - monthlyDebtService;
    const yearlyEquityCF = monthlyEquityCF * 12;
    const yearlyEquityCFPerInvestor =
      equityCount > 0 ? yearlyEquityCF / equityCount : 0;

    cumulEquityCFPerInvestor += yearlyEquityCFPerInvestor;

    const yearlyDebtIncomePerInvestor =
      debtCount > 0
        ? (totalDebt * (debtRatePct / 100)) / debtCount
        : 0;

    cumulDebtIncomePerInvestor += yearlyDebtIncomePerInvestor;

    rows.push({
      year: y,
      propValue,
      equityTotal,
      equityPerInvestor,
      yearlyEquityCF,
      yearlyEquityCFPerInvestor,
      cumulEquityCFPerInvestor,
      yearlyDebtIncomePerInvestor,
      cumulDebtIncomePerInvestor,
    });
  }

  return rows;
}

/**
 * Generate investor-pitch paragraphs from deal inputs + result.
 * @param {DealInputs} inputs
 * @param {Object}     dealResult
 * @returns {{ paragraphs: string[] }}
 */
export function formatDealSummary(inputs, dealResult) {
  const {
    address = 'the subject property',
    purchasePrice = 0,
    repairCosts = 0,
    reserveFund = 0,
    equityCount = 0,
    equityPerInvestor = 0,
    debtCount = 0,
    debtPerInvestor = 0,
    debtRatePct = 0,
  } = inputs;

  const {
    totalEquity,
    totalDebt,
    totalRaise,
    totalNeed,
    surplus,
    grossRent,
    equityCashFlow,
    equityCashFlowPerInvestor,
    equityCoC,
    debtAnnualIncomePerInvestor,
    debtCoverage,
    noiMonthly,
    monthlyDebtService,
  } = dealResult;

  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const fmtPct = (n) => Number(n).toFixed(1);

  // Paragraph 1 — Overview & capital structure
  const p1 =
    `This investment acquires a single-family property at ${address} for $${fmt(purchasePrice)}, ` +
    `plus $${fmt(repairCosts)} in planned renovations and a $${fmt(reserveFund)} operating reserve, ` +
    `funded entirely through private capital. The total capital requirement is $${fmt(totalNeed)}.` +
    (surplus === 0
      ? ' The capital structure is perfectly balanced with no gap or surplus.'
      : surplus > 0
      ? ` The raise generates a $${fmt(surplus)} surplus above the total need, providing additional cushion.`
      : ` There is a $${fmt(Math.abs(surplus))} gap between the raise and the total need that must be addressed.`);

  // Paragraph 2 — Investor terms
  const equityLine =
    equityCount > 0
      ? `${equityCount} equity investor${equityCount > 1 ? 's' : ''} contributing $${fmt(equityPerInvestor)} each (total $${fmt(totalEquity)})`
      : 'no equity investors';

  const debtLine =
    debtCount > 0
      ? `${debtCount} private lender${debtCount > 1 ? 's' : ''} providing $${fmt(debtPerInvestor)} each at ${fmtPct(debtRatePct)}% annual interest (total $${fmt(totalDebt)})`
      : 'no debt financing';

  const p2 =
    `The capital structure consists of ${equityLine} and ${debtLine}. ` +
    (debtCount > 0
      ? `Debt investors receive a fixed ${fmtPct(debtRatePct)}% return — $${fmt(debtAnnualIncomePerInvestor)} per lender annually — with first priority on income. `
      : '') +
    (equityCount > 0
      ? `Equity investors participate in residual cash flow and property appreciation.`
      : '');

  // Paragraph 3 — Monthly cash flow
  const cfSign = equityCashFlow >= 0 ? 'positive' : 'negative';
  const p3 =
    `At $${fmt(grossRent)}/month in gross rent, the property generates a monthly NOI of $${fmt(noiMonthly)} ` +
    `after operating expenses. After servicing $${fmt(monthlyDebtService)}/month in private debt interest, ` +
    `the deal produces ${cfSign} equity cash flow of $${fmt(Math.abs(equityCashFlow))}/month ` +
    (equityCount > 0
      ? `($${fmt(Math.abs(equityCashFlowPerInvestor))}/month per equity investor). `
      : '. ') +
    `The debt coverage ratio is ${debtCoverage !== null ? fmtPct(debtCoverage) + 'x' : 'N/A'}` +
    (debtCoverage !== null && debtCoverage >= 1.25
      ? ', indicating strong coverage of debt obligations.'
      : debtCoverage !== null && debtCoverage >= 1.0
      ? ', providing adequate but tight coverage of debt obligations.'
      : debtCoverage !== null
      ? ', which is below the 1.0x threshold — the deal does not fully cover debt service from NOI alone.'
      : '.');

  // Paragraph 4 — Return summary & appreciation upside
  const p4 =
    (equityCount > 0 && equityCoC !== 0
      ? `Equity investors earn a ${fmtPct(equityCoC)}% cash-on-cash return on their capital in Year 1. `
      : '') +
    `With an assumed 3% annual appreciation rate and 2.5% annual rent growth, ` +
    `both the property value and income are projected to grow meaningfully over a five-year hold. ` +
    `This structure is designed to provide lenders a predictable, secured return while rewarding equity partners with upside from ` +
    `appreciation and improving cash flow as rents rise.`;

  return { paragraphs: [p1, p2, p3, p4] };
}
