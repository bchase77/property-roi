export function mortgageMonthly(principal, aprPct, years) {
  const r = aprPct / 100 / 12;
  const n = years * 12;
  if (!r) return principal / n;
  return principal * (r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

export function analyze({
  purchasePrice, downPct, rateApr, years,
  monthlyRent, taxPct, hoaMonthly, insuranceMonthly,
  maintPctRent, vacancyPctRent, mgmtPctRent, otherMonthly,
  initialInvestment, mortgageFree
}) {
  const down = mortgageFree ? purchasePrice : purchasePrice * (downPct / 100);
  const invested = (initialInvestment ?? 0) > 0 ? initialInvestment : down;
  const loan = mortgageFree ? 0 : purchasePrice - down;
  const pAndI = mortgageFree ? 0 : mortgageMonthly(loan, rateApr, years);

  const taxesMonthly = (purchasePrice * (taxPct / 100)) / 12;
  const maint = monthlyRent * (maintPctRent / 100);
  const vacancy = monthlyRent * (vacancyPctRent / 100);
  const mgmt = monthlyRent * (mgmtPctRent / 100);

  const operatingExpenses =
    taxesMonthly + hoaMonthly + insuranceMonthly + maint + vacancy + mgmt + otherMonthly;

  const noiMonthly = monthlyRent - (operatingExpenses - vacancy); // NOI excludes vacancy by convention
  const noiAnnual = noiMonthly * 12;

  const cashflowMonthly = monthlyRent - (pAndI + operatingExpenses);
  const cashOnCash = invested > 0 ? ((cashflowMonthly * 12) / invested) * 100 : null;

  const capRate = (noiAnnual / purchasePrice) * 100;
  const dscr = pAndI ? (noiMonthly / pAndI) : Infinity;
  const grossYield = (monthlyRent * 12 / purchasePrice) * 100;

  const round2 = (n) => Math.round(n * 100) / 100;
  const pct2 = (n) => Math.round(n * 100) / 100;

  return {
    down: round2(down),
    loan: round2(loan),
    pAndI: round2(pAndI),
    taxesMonthly: round2(taxesMonthly),
    operatingExpenses: round2(operatingExpenses),
    noiMonthly: round2(noiMonthly),
    noiAnnual: round2(noiAnnual),
    cashflowMonthly: round2(cashflowMonthly),
    metrics: {
      capRate: pct2(capRate),
      cashOnCash: cashOnCash == null ? 0 : Math.round(cashOnCash * 100) / 100,
      dscr: round2(dscr),
      grossYield: pct2(grossYield),
    },
  };
}

