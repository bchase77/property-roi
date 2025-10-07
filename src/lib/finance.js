export function mortgageMonthly(principal, aprPct, years) {
  const r = aprPct / 100 / 12;
  const n = years * 12;
  if (!r) return principal / n;
  return principal * (r * (1 + r) ** n) / ((1 + r) ** n - 1);
}

// Calculate remaining mortgage balance after a number of payments
export function mortgageBalance(principal, aprPct, years, paymentsMade) {
  const r = aprPct / 100 / 12;
  const n = years * 12;
  
  if (!r) return Math.max(0, principal - (principal / n) * paymentsMade);
  if (paymentsMade >= n) return 0;
  
  const monthlyPayment = mortgageMonthly(principal, aprPct, years);
  const balance = principal * Math.pow(1 + r, paymentsMade) - monthlyPayment * (Math.pow(1 + r, paymentsMade) - 1) / r;
  
  return balance;
}

// Calculate equity for a property at a specific year, considering mortgage payoff
export function calculateEquityAtYear(property, year, propertyValue) {
  const purchaseYear = property.year_purchased;
  const payoffDate = property.mortgage_payoff_date;
  
  // console.log('🔍 DEBUGGING calculateEquityAtYear for year', year, 'propertyValue', propertyValue);
  
  if (!purchaseYear || year < purchaseYear) return 0;
  
  // If there's no payoff date and property was always mortgage-free
  if (!payoffDate && property.mortgage_free) {
    return propertyValue;
  }
  
  // If there's no payoff date but property had a mortgage, we can't calculate accurately
  if (!payoffDate && !property.mortgage_free) {
    return propertyValue;
  }
  
  const payoffYear = new Date(payoffDate).getFullYear();
  
  // If year is after payoff, equity = full property value
  if (year >= payoffYear) {
    return propertyValue;
  }
  
  // Calculate mortgage balance for years before payoff
  const loanAmount = Number(property.purchase_price) * (1 - Number(property.down_payment_pct) / 100);
  const monthsElapsed = (year - purchaseYear) * 12;
  const remainingBalance = mortgageBalance(
    loanAmount,
    Number(property.interest_apr_pct),
    Number(property.loan_years),
    monthsElapsed
  );
  
  return Math.max(propertyValue - remainingBalance, 0);
}

// Analyze using current values if available, fallback to original purchase data
export function analyzeWithCurrentValues(property) {
  return analyze({
    purchasePrice: Number(property.purchase_price) || 0,
    downPct: Number(property.down_payment_pct) || 20,
    rateApr: Number(property.current_mortgage_rate || property.interest_apr_pct) || 6.5,
    years: Number(property.current_mortgage_term_remaining || property.loan_years) || 30,
    monthlyRent: Number(property.current_rent_monthly || property.monthly_rent) || 0,
    taxPct: Number(property.property_tax_pct) || 1.2, // Will be overridden by current taxes calc
    hoaMonthly: Number(property.current_hoa_monthly || property.hoa_monthly) || 0,
    insuranceMonthly: Number((property.current_insurance_annual || property.insurance_monthly * 12) / 12) || 120,
    maintPctRent: Number(property.maintenance_pct_rent) || 5, // For consistency with original
    vacancyPctRent: Number(property.vacancy_pct_rent) || 5, // For consistency with original  
    mgmtPctRent: Number(property.current_management_pct || property.management_pct_rent) || 8,
    otherMonthly: Number(property.other_monthly) || 0,
    initialInvestment: Number(property.initial_investment) || 0,
    mortgageFree: Boolean(property.mortgage_free),
    // Current specific overrides
    currentTaxesAnnual: property.current_appraisal_value ? 
      ((Number(property.current_appraisal_value) * (Number(property.assessment_percentage) || 25) / 100) * 
       ((Number(property.current_county_tax_rate) || 0) + (Number(property.current_city_tax_rate) || 0)) / 100) : null,
    currentExpensesAnnual: property.current_expenses_annual ? Number(property.current_expenses_annual) : null,
    currentMortgagePayment: property.current_mortgage_payment ? Number(property.current_mortgage_payment) : null
  });
}

// Calculate IRR (Internal Rate of Return) for a property investment
export function calculateIRR(cashFlows) {
  // cashFlows: array of annual cash flows including initial investment (negative) and final sale proceeds
  // Uses Newton-Raphson method to find IRR
  if (!cashFlows || cashFlows.length < 2) return null;
  
  let guess = 0.1; // Start with 10% guess
  const maxIterations = 100;
  const tolerance = 0.0001;
  
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let npvDerivative = 0;
    
    for (let j = 0; j < cashFlows.length; j++) {
      const period = j;
      npv += cashFlows[j] / Math.pow(1 + guess, period);
      npvDerivative -= (period * cashFlows[j]) / Math.pow(1 + guess, period + 1);
    }
    
    if (Math.abs(npv) < tolerance) {
      return guess * 100; // Return as percentage
    }
    
    if (npvDerivative === 0) break;
    guess = guess - npv / npvDerivative;
    
    if (guess < -0.99) guess = -0.99; // Prevent negative values below -99%
  }
  
  return guess * 100; // Return as percentage
}

// Calculate CAGR (Compound Annual Growth Rate)
export function calculateCAGR(beginningValue, endingValue, years) {
  if (!beginningValue || !endingValue || !years || years <= 0) return null;
  return (Math.pow(endingValue / beginningValue, 1 / years) - 1) * 100;
}

// Calculate market comparison (S&P 500 historical average ~10%)
export function calculateMarketComparison(propertyCAGR, marketReturn = 10) {
  if (propertyCAGR === null) return null;
  return propertyCAGR - marketReturn;
}

// Calculate current equity and opportunity cost analysis
export function calculateHoldVsSell(property, marketReturn = 10) {
  const metrics = analyzeWithCurrentValues(property);
  const currentValue = property.current_market_value || property.purchase_price;
  const currentMortgageBalance = property.current_mortgage_balance || 0;
  const currentEquity = currentValue - currentMortgageBalance;
  
  // Current cash-on-cash return on equity
  const currentCashOnEquity = currentEquity > 0 ? ((metrics.cashflowMonthly * 12) / currentEquity) * 100 : 0;
  
  // Opportunity cost (what you could earn in market vs property)
  const opportunityCost = marketReturn - currentCashOnEquity;
  
  return {
    currentEquity,
    currentCashOnEquity,
    opportunityCost,
    recommendation: opportunityCost > 5 ? 'Consider Selling' : opportunityCost > 2 ? 'Review' : 'Hold'
  };
}

export function analyze({
  purchasePrice, downPct, rateApr, years,
  monthlyRent, taxPct, taxAnnual, taxInputMode, hoaMonthly, insuranceMonthly,
  maintPctRent, vacancyPctRent, mgmtPctRent, otherMonthly,
  initialInvestment, mortgageFree,
  // New parameters for current values
  currentTaxesAnnual, currentExpensesAnnual, currentMortgagePayment
}) {
  const down = mortgageFree ? purchasePrice : purchasePrice * (downPct / 100);
  const invested = (initialInvestment ?? 0) > 0 ? initialInvestment : down;
  const loan = mortgageFree ? 0 : purchasePrice - down;
  
  // Use current mortgage payment if available, otherwise calculate
  const pAndI = mortgageFree ? 0 : (currentMortgagePayment || mortgageMonthly(loan, rateApr, years));

  // Use current taxes if available, otherwise calculate based on input mode
  let taxesMonthly;
  if (currentTaxesAnnual) {
    taxesMonthly = currentTaxesAnnual / 12;
  } else if (taxInputMode === 'annual' && taxAnnual) {
    taxesMonthly = taxAnnual / 12;
  } else {
    taxesMonthly = (purchasePrice * (taxPct / 100)) / 12;
  }
  
  // Use current expenses if explicitly set and non-zero, otherwise calculate from percentages
  const maint = (currentExpensesAnnual !== null && currentExpensesAnnual !== undefined && currentExpensesAnnual > 0) ? (currentExpensesAnnual / 12) : (monthlyRent * (maintPctRent / 100));
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

