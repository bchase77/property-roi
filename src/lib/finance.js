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
  // console.log(`🔧 calculateEquityAtYear called for ${property.address} year ${year} value ${propertyValue}`);
  
  const currentYear = 2025;
  const purchaseYear = property.year_purchased || currentYear; // Use current year for unpurchased properties
  const payoffDate = property.mortgage_payoff_date;
  
  
  if (year < purchaseYear) return 0;
  
  // If there's no payoff date and property was always mortgage-free
  if (!payoffDate && property.mortgage_free) {
    return propertyValue;
  }
  
  // If there's no payoff date but property has an active mortgage, calculate current balance
  if (!payoffDate && !property.mortgage_free) {
    // Calculate mortgage balance for active loan (no payoff date means loan continues)
    const loanAmount = Number(property.purchase_price) * (1 - Number(property.down_payment_pct) / 100);
    const monthsElapsed = (year - purchaseYear) * 12;
    const remainingBalance = mortgageBalance(
      loanAmount,
      Number(property.interest_apr_pct),
      Number(property.loan_years),
      monthsElapsed
    );
    
    const calculatedEquity = Math.max(propertyValue - remainingBalance, 0);
    
    return calculatedEquity;
  }
  
  // At this point, we must have a payoff date since we handled the no-payoff cases above
  
  const payoffYear = new Date(payoffDate).getFullYear();
  
  // If year is after payoff, equity = full property value
  if (year >= payoffYear) {
    return propertyValue;
  }
  
  // Calculate mortgage balance for years before payoff (for properties with payoff dates)
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
  console.log('📊 PORTFOLIO PAGE - analyzeWithCurrentValues for:', property.address);
  
  // Debug tax calculation for Portfolio page
  const portfolioCurrentTaxesAnnual = property.current_appraisal_value ? 
    ((Number(property.current_appraisal_value) * (Number(property.assessment_percentage) || 25) / 100) * 
     ((Number(property.current_county_tax_rate) || 0) + (Number(property.current_city_tax_rate) || 0)) / 100) : null;
     
  const finalPortfolioTaxes = (property.tax_annual && Number(property.tax_annual) > 0) ? 
    Number(property.tax_annual) : portfolioCurrentTaxesAnnual;
    
  console.log('🏛️ PORTFOLIO PAGE Tax calc:', {
    tax_annual_manual: property.tax_annual,
    current_appraisal_value: property.current_appraisal_value,
    current_county_tax_rate: property.current_county_tax_rate,
    current_city_tax_rate: property.current_city_tax_rate,
    calculated_taxes_annual: portfolioCurrentTaxesAnnual,
    final_taxes_annual: finalPortfolioTaxes,
    using_manual: !!(property.tax_annual && Number(property.tax_annual) > 0)
  });
  
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
    mgmtPctRent: Number(property.current_management_pct ?? property.management_pct_rent) ?? 8,
    otherMonthly: Number(property.other_monthly) || 0,
    initialInvestment: Number(property.initial_investment) || 0,
    closingCosts: Number(property.closing_costs) || 0,
    repairCosts: Number(property.repair_costs) || 0,
    mortgageFree: Boolean(property.mortgage_free),
    // Current specific overrides - use manual tax_annual if available, otherwise calculate
    currentTaxesAnnual: (property.tax_annual && Number(property.tax_annual) > 0) ? 
      Number(property.tax_annual) :
      (property.current_appraisal_value ? 
        ((Number(property.current_appraisal_value) * (Number(property.assessment_percentage) || 25) / 100) * 
         ((Number(property.current_county_tax_rate) || 0) + (Number(property.current_city_tax_rate) || 0)) / 100) : null),
    currentExpensesAnnual: property.current_expenses_annual ? Number(property.current_expenses_annual) : null,
    currentMortgagePayment: property.current_mortgage_payment ? Number(property.current_mortgage_payment) : null,
    propertyAddress: property.address || property.abbreviation,
    // Original values for historical tracking
    originalMonthlyRent: property.original_monthly_rent ? Number(property.original_monthly_rent) : null,
    originalPropertyTaxPct: property.original_property_tax_pct ? Number(property.original_property_tax_pct) : null,
    originalInsuranceMonthly: property.original_insurance_monthly ? Number(property.original_insurance_monthly) : null,
    originalMaintenancePctRent: property.original_maintenance_pct_rent ? Number(property.original_maintenance_pct_rent) : null,
    originalVacancyPctRent: property.original_vacancy_pct_rent ? Number(property.original_vacancy_pct_rent) : null,
    originalManagementPctRent: property.original_management_pct_rent ? Number(property.original_management_pct_rent) : null
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
  initialInvestment, closingCosts, repairCosts, mortgageFree,
  // New parameters for current values
  currentTaxesAnnual, currentExpensesAnnual, currentMortgagePayment,
  // Property identification for debugging
  propertyAddress,
  // Original values for historical tracking
  originalMonthlyRent, originalPropertyTaxPct, originalInsuranceMonthly,
  originalMaintenancePctRent, originalVacancyPctRent, originalManagementPctRent
}) {
  const down = purchasePrice * (downPct / 100);
  const totalClosingCosts = (closingCosts || 0) + (repairCosts || 0);
  const invested = (initialInvestment ?? 0) > 0 ? initialInvestment : down + totalClosingCosts;
  const loan = mortgageFree ? 0 : purchasePrice - down;
  
  // Use current mortgage payment if available, otherwise calculate
  const pAndI = mortgageFree ? 0 : (currentMortgagePayment || mortgageMonthly(loan, rateApr, years));

  // Use current taxes if available, otherwise calculate based on input mode
  let taxesMonthly;
  if (currentTaxesAnnual) {
    taxesMonthly = currentTaxesAnnual / 12;
    console.log('💰 Tax calc: Using currentTaxesAnnual', currentTaxesAnnual, '→ monthly:', taxesMonthly);
  } else if (taxInputMode === 'annual' && taxAnnual) {
    taxesMonthly = taxAnnual / 12;
    console.log('💰 Tax calc: Using taxAnnual', taxAnnual, '→ monthly:', taxesMonthly);
  } else {
    taxesMonthly = (purchasePrice * (taxPct / 100)) / 12;
    console.log('💰 Tax calc: Using percentage', purchasePrice, 'x', taxPct, '% → monthly:', taxesMonthly);
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

  // Calculate 30-Year Average Total ROI (User's exact formula)
  const calculate30yATROI = () => {
    const years = 30;
    const propertyId = propertyAddress || `Property $${purchasePrice}` || 'Property';
    
    console.log(`🔍 30yATROI Input Values for ${propertyId}:`, {
      purchasePrice,
      monthlyRent,
      maintPctRent,
      vacancyPctRent,
      mgmtPctRent,
      taxesMonthly,
      insuranceMonthly,
      hoaMonthly,
      totalClosingCosts,
      invested,
      mortgageFree,
      pAndI,
      rateApr,
      downPct,
      years,
      initialInvestment,
      closingCosts,
      repairCosts
    });

    // ===== USER'S EXACT FORMULA: (Total_value - Total_expenses) / Amount_paid / 30 =====

    // 1. AMOUNT_PAID = downpayment + closing_costs + initial repairs
    const downPayment = purchasePrice * (downPct / 100);
    const amountPaid = downPayment + totalClosingCosts;
    
    console.log('💰 AMOUNT_PAID Calculation:', {
      downPayment: downPayment.toFixed(2),
      closingCosts: (closingCosts || 0).toFixed(2),
      repairCosts: (repairCosts || 0).toFixed(2),
      totalClosingCosts: totalClosingCosts.toFixed(2),
      amountPaid: amountPaid.toFixed(2)
    });

    // 2. INCOME_EARNED_FOR_30Y = Rent for 30 years factoring in vacancy rate
    const effectiveMonthlyRent = monthlyRent * (1 - (vacancyPctRent / 100));
    const incomeEarnedFor30y = effectiveMonthlyRent * 12 * years;
    
    console.log('🏠 INCOME_EARNED_FOR_30Y Calculation:', {
      monthlyRent: monthlyRent.toFixed(2),
      vacancyPctRent: vacancyPctRent.toFixed(2),
      effectiveMonthlyRent: effectiveMonthlyRent.toFixed(2),
      yearsOfRent: years,
      incomeEarnedFor30y: incomeEarnedFor30y.toFixed(2)
    });

    // 3. TOTAL_VALUE = current price of home + Income_earned_for_30y
    const totalValue = purchasePrice + incomeEarnedFor30y;
    
    console.log('📈 TOTAL_VALUE Calculation:', {
      currentPriceOfHome: purchasePrice.toFixed(2),
      incomeEarnedFor30y: incomeEarnedFor30y.toFixed(2),
      totalValue: totalValue.toFixed(2)
    });

    // 4. TOTAL_EXPENSES = Amount I initially paid + all monthly costs over 30 years
    let totalExpenses = amountPaid; // Start with initial investment
    
    // Management fees (% of rent)
    const annualManagement = monthlyRent * 12 * (mgmtPctRent / 100);
    const totalManagement = annualManagement * years;
    totalExpenses += totalManagement;
    
    // Mortgage payments - ALWAYS include for 30yATROI calculation (even for cash purchases)
    // This represents what mortgage payments would have been over 30 years
    let totalMortgagePayments = 0;
    if (pAndI > 0) {
      totalMortgagePayments = pAndI * 12 * years;
    }
    totalExpenses += totalMortgagePayments;
    
    // Property taxes
    const annualTaxes = taxesMonthly * 12;
    const totalTaxes = annualTaxes * years;
    totalExpenses += totalTaxes;
    
    // Maintenance (% of rent) - calculate monthly first like spreadsheets typically do
    const monthlyMaintenanceExpense = monthlyRent * (maintPctRent / 100);
    const totalMaintenanceExpenses = monthlyMaintenanceExpense * 12 * years;
    totalExpenses += totalMaintenanceExpenses;
    
    // Insurance
    const totalInsurance = insuranceMonthly * 12 * years;
    totalExpenses += totalInsurance;
    
    // HOA fees
    const totalHOA = hoaMonthly * 12 * years;
    totalExpenses += totalHOA;
    
    // Property taxes (already calculated above)
    const totalPropertyTaxes = totalTaxes; // Same as totalTaxes
    
    console.log('💸 TOTAL_EXPENSES Breakdown:', {
      initialAmountPaid: amountPaid.toFixed(2),
      totalManagement: totalManagement.toFixed(2),
      totalMortgagePayments: totalMortgagePayments.toFixed(2),
      totalPropertyTaxes: totalPropertyTaxes.toFixed(2),
      totalMaintenanceExpenses: totalMaintenanceExpenses.toFixed(2),
      totalInsurance: totalInsurance.toFixed(2),
      totalHOA: totalHOA.toFixed(2),
      subtotalBeforeIncomeTax: totalExpenses.toFixed(2)
    });

    // 5. INCOME TAXES = 44% × (rental income with vacancy - expenses - depreciation)
    // Monthly depreciation = (purchase price + closing costs + 1 year insurance) ÷ 27.5 ÷ 12
    const depreciableBasis = purchasePrice + totalClosingCosts + (insuranceMonthly * 12);
    const monthlyDepreciation = (depreciableBasis / 27.5) / 12;
    const totalDepreciation = monthlyDepreciation * 12 * years;
    
    // Monthly taxable income = effective rent - (management + maintenance + insurance + depreciation + property tax)
    const monthlyManagement = monthlyRent * (mgmtPctRent / 100);
    const monthlyMaintenance = monthlyRent * (maintPctRent / 100);
    const monthlyTaxableIncome = effectiveMonthlyRent - monthlyManagement - monthlyMaintenance - insuranceMonthly - monthlyDepreciation - taxesMonthly;
    
    // Monthly income tax = taxable income × 44%
    const monthlyIncomeTax = Math.max(0, monthlyTaxableIncome * 0.44);
    const totalIncomeTax = monthlyIncomeTax * 12 * years;
    
    totalExpenses += totalIncomeTax;
    
    console.log('📊 INCOME TAX Calculation:', {
      depreciableBasis: depreciableBasis.toFixed(2),
      monthlyDepreciation: monthlyDepreciation.toFixed(2),
      totalDepreciation: totalDepreciation.toFixed(2),
      effectiveMonthlyRent: effectiveMonthlyRent.toFixed(2),
      monthlyManagement: monthlyManagement.toFixed(2),
      monthlyMaintenance: monthlyMaintenance.toFixed(2),
      monthlyInsurance: insuranceMonthly.toFixed(2),
      monthlyTaxableIncome: monthlyTaxableIncome.toFixed(2),
      monthlyIncomeTax: monthlyIncomeTax.toFixed(2),
      totalIncomeTax: totalIncomeTax.toFixed(2),
      finalTotalExpenses: totalExpenses.toFixed(2)
    });

    // 6. FINAL CALCULATION: (Total_value - Total_expenses) / Amount_paid / 30
    const netValue = totalValue - totalExpenses;
    const atROI = amountPaid > 0 ? (netValue / amountPaid) / years : 0;
    
    console.log(`🎯 FINAL 30yATROI Calculation for ${propertyId}:`, {
      totalValue: totalValue.toFixed(2),
      totalExpenses: totalExpenses.toFixed(2),
      netValue: netValue.toFixed(2),
      amountPaid: amountPaid.toFixed(2),
      years: years,
      formula: `(${totalValue.toFixed(2)} - ${totalExpenses.toFixed(2)}) / ${amountPaid.toFixed(2)} / ${years}`,
      atROI_decimal: atROI.toFixed(6),
      atROI_percentage: (atROI * 100).toFixed(4)
    });
    
    return atROI * 100; // Convert to percentage
  };

  // Calculate original 30yATROI using historical purchase-time values
  const calculateOriginal30yATROI = (useOriginalValues = false) => {
    if (!useOriginalValues) return calculate30yATROI();
    
    const years = 30;
    const propertyId = propertyAddress || `Property $${purchasePrice}` || 'Property';
    
    // Use original values from database if available, fallback to current
    const origMonthlyRent = originalMonthlyRent || monthlyRent;
    const origPropertyTaxPct = originalPropertyTaxPct || (taxesMonthly * 12 / purchasePrice) * 100;
    const origInsuranceMonthly = originalInsuranceMonthly || insuranceMonthly;
    const origMaintPctRent = originalMaintenancePctRent || maintPctRent;
    const origVacancyPctRent = originalVacancyPctRent || vacancyPctRent;
    const origMgmtPctRent = originalManagementPctRent || mgmtPctRent;
    
    console.log(`🕰️ ORIGINAL 30yATROI Calculation for ${propertyId}:`, {
      origMonthlyRent,
      origPropertyTaxPct,
      origInsuranceMonthly,
      origMaintPctRent,
      origVacancyPctRent,
      origMgmtPctRent
    });

    // 1. AMOUNT_PAID = downpayment + closing_costs + initial repairs (same as current)
    const downPayment = purchasePrice * (downPct / 100);
    const amountPaid = downPayment + totalClosingCosts;
    
    // 2. INCOME_EARNED_FOR_30Y = Original rent for 30 years factoring in vacancy rate
    const effectiveOrigMonthlyRent = origMonthlyRent * (1 - (origVacancyPctRent / 100));
    const origIncomeEarnedFor30y = effectiveOrigMonthlyRent * 12 * years;
    
    // 3. TOTAL_VALUE = purchase price + original income
    const origTotalValue = purchasePrice + origIncomeEarnedFor30y;
    
    // 4. TOTAL_EXPENSES using original rates
    let origTotalExpenses = amountPaid; // Start with initial investment
    
    // Original management fees
    const origAnnualManagement = origMonthlyRent * 12 * (origMgmtPctRent / 100);
    origTotalExpenses += origAnnualManagement * years;
    
    // Mortgage payments (same as current)
    let origTotalMortgagePayments = 0;
    if (!mortgageFree && pAndI > 0) {
      origTotalMortgagePayments = pAndI * 12 * years;
    }
    origTotalExpenses += origTotalMortgagePayments;
    
    // Original property taxes
    const origAnnualTaxes = purchasePrice * (origPropertyTaxPct / 100);
    origTotalExpenses += origAnnualTaxes * years;
    
    // Original maintenance
    const origAnnualMaintenance = origMonthlyRent * 12 * (origMaintPctRent / 100);
    origTotalExpenses += origAnnualMaintenance * years;
    
    // Original insurance
    origTotalExpenses += origInsuranceMonthly * 12 * years;
    
    // HOA fees (same as current)
    origTotalExpenses += hoaMonthly * 12 * years;
    
    // Original income taxes calculation
    const origDepreciableBasis = purchasePrice + totalClosingCosts + (origInsuranceMonthly * 12);
    const origMonthlyDepreciation = (origDepreciableBasis / 27.5) / 12;
    
    const origMonthlyManagement = origMonthlyRent * (origMgmtPctRent / 100);
    const origMonthlyMaintenance = origMonthlyRent * (origMaintPctRent / 100);
    const origAnnualTaxesMonthly = origAnnualTaxes / 12;
    
    const origMonthlyTaxableIncome = effectiveOrigMonthlyRent - origMonthlyManagement - 
      origMonthlyMaintenance - origInsuranceMonthly - origMonthlyDepreciation - origAnnualTaxesMonthly;
    
    const origMonthlyIncomeTax = Math.max(0, origMonthlyTaxableIncome * 0.44);
    const origTotalIncomeTax = origMonthlyIncomeTax * 12 * years;
    
    origTotalExpenses += origTotalIncomeTax;
    
    // 6. FINAL CALCULATION: (Total_value - Total_expenses) / Amount_paid / 30
    const origNetValue = origTotalValue - origTotalExpenses;
    const origAtROI = amountPaid > 0 ? (origNetValue / amountPaid) / years : 0;
    
    console.log(`🕰️ FINAL ORIGINAL 30yATROI for ${propertyId}:`, {
      origTotalValue: origTotalValue.toFixed(2),
      origTotalExpenses: origTotalExpenses.toFixed(2),
      origNetValue: origNetValue.toFixed(2),
      amountPaid: amountPaid.toFixed(2),
      years: years,
      origAtROI_percentage: (origAtROI * 100).toFixed(4)
    });
    
    return origAtROI * 100;
  };

  const atROI30y = calculate30yATROI();
  const originalAtROI30y = calculateOriginal30yATROI(!!originalMonthlyRent);

  // Calculate comprehensive 30-Year Total Return on Investment (TRI)
  const calculate30yTRI = () => {
    const years = 30;
    const inflationRate = 0.025; // 2.5% annual inflation
    const propertyAppreciationRate = 0.03; // Conservative 3% annual appreciation
    const rentGrowthRate = 0.025; // 2.5% annual rent growth
    const expenseGrowthRate = 0.025; // 2.5% annual expense growth
    const discountRate = 0.07; // 7% discount rate for NPV
    
    // Get property identifier for debugging
    const propertyId = propertyAddress || `Property $${purchasePrice}` || 'Property';
    
    console.log(`🏆 30y TRI Comprehensive Calculation Starting for ${propertyId}...`);
    
    let totalPresentValue = 0;
    let currentRent = monthlyRent;
    let currentTaxes = taxesMonthly;
    let currentInsurance = insuranceMonthly;
    let currentHOA = hoaMonthly;
    
    // Calculate year-by-year cash flows with inflation adjustments
    for (let year = 1; year <= years; year++) {
      // Adjust rent and expenses for inflation
      const adjustedRent = currentRent * Math.pow(1 + rentGrowthRate, year - 1);
      const adjustedTaxes = currentTaxes * Math.pow(1 + expenseGrowthRate, year - 1);
      const adjustedInsurance = currentInsurance * Math.pow(1 + expenseGrowthRate, year - 1);
      const adjustedHOA = currentHOA * Math.pow(1 + expenseGrowthRate, year - 1);
      
      // Annual income (with vacancy)
      const effectiveAnnualRent = adjustedRent * 12 * (1 - (vacancyPctRent / 100));
      
      // Annual operating expenses
      const annualManagement = adjustedRent * 12 * (mgmtPctRent / 100);
      const annualMaintenance = adjustedRent * 12 * (maintPctRent / 100);
      const annualTaxes = adjustedTaxes * 12;
      const annualInsurance = adjustedInsurance * 12;
      const annualHOA = adjustedHOA * 12;
      
      // Annual mortgage payment (fixed)
      const annualMortgage = mortgageFree ? 0 : pAndI * 12;
      
      // Depreciation calculation (same basis, not adjusted for inflation)
      const depreciableBasis = purchasePrice + totalClosingCosts + (insuranceMonthly * 12);
      const annualDepreciation = depreciableBasis / 27.5;
      
      // Taxable income calculation
      const taxableIncome = effectiveAnnualRent - annualManagement - annualMaintenance - 
                           annualTaxes - annualInsurance - annualDepreciation;
      
      // Federal income tax (44% combined rate)
      const federalTax = Math.max(0, taxableIncome * 0.44);
      
      // Net cash flow for the year
      const netCashFlow = effectiveAnnualRent - annualManagement - annualMaintenance - 
                         annualTaxes - annualInsurance - annualHOA - annualMortgage - federalTax;
      
      // Present value of this year's cash flow
      const presentValue = netCashFlow / Math.pow(1 + discountRate, year);
      totalPresentValue += presentValue;
    }
    
    // Final sale calculation (Year 30)
    const finalPropertyValue = purchasePrice * Math.pow(1 + propertyAppreciationRate, years);
    
    // Remaining mortgage balance at year 30
    let remainingMortgage = 0;
    if (!mortgageFree && pAndI > 0) {
      const loanTermYears = Number(years) || 30;
      if (years < loanTermYears) {
        const monthlyRate = (rateApr || 0) / 100 / 12;
        if (monthlyRate > 0) {
          const loan = purchasePrice * (1 - (downPct / 100));
          remainingMortgage = loan * Math.pow(1 + monthlyRate, years * 12) - 
            (pAndI * (Math.pow(1 + monthlyRate, years * 12) - 1) / monthlyRate);
        }
      }
    }
    
    // Sale proceeds after mortgage payoff
    const saleProceeds = finalPropertyValue - remainingMortgage;
    
    // Depreciation recapture tax (25% on total depreciation taken)
    const totalDepreciationTaken = (purchasePrice + totalClosingCosts + (insuranceMonthly * 12)) / 27.5 * years;
    const depreciationRecaptureTax = totalDepreciationTaken * 0.25;
    
    // Capital gains tax (15% on appreciation above depreciation recapture)
    const totalGain = finalPropertyValue - purchasePrice;
    const capitalGain = Math.max(0, totalGain - totalDepreciationTaken);
    const capitalGainsTax = capitalGain * 0.15;
    
    // Net sale proceeds after taxes
    const netSaleProceeds = saleProceeds - depreciationRecaptureTax - capitalGainsTax;
    
    // Present value of sale proceeds
    const salePresentValue = netSaleProceeds / Math.pow(1 + discountRate, years);
    
    // Total present value of all cash flows
    const totalPV = totalPresentValue + salePresentValue;
    
    // Initial investment
    const initialInvestment = purchasePrice * (downPct / 100) + totalClosingCosts;
    
    // Calculate IRR and total return
    const totalReturn = totalPV - initialInvestment;
    const annualizedReturn = totalReturn > 0 ? 
      (Math.pow(totalPV / initialInvestment, 1 / years) - 1) * 100 : 0;
    
    console.log(`🏆 30y TRI Final Results for ${propertyId}:`, {
      initialInvestment: initialInvestment.toFixed(2),
      totalCashFlowPV: totalPresentValue.toFixed(2),
      finalPropertyValue: finalPropertyValue.toFixed(2),
      netSaleProceeds: netSaleProceeds.toFixed(2),
      salePresentValue: salePresentValue.toFixed(2),
      totalPresentValue: totalPV.toFixed(2),
      totalReturn: totalReturn.toFixed(2),
      annualizedReturn: annualizedReturn.toFixed(2),
      assumptions: {
        inflationRate: (inflationRate * 100).toFixed(1) + '%',
        propertyAppreciation: (propertyAppreciationRate * 100).toFixed(1) + '%',
        rentGrowth: (rentGrowthRate * 100).toFixed(1) + '%',
        discountRate: (discountRate * 100).toFixed(1) + '%'
      }
    });
    
    return annualizedReturn;
  };

  const tri30y = calculate30yTRI();

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
      atROI30y: pct2(atROI30y),
      tri30y: pct2(tri30y),
      originalAtROI30y: pct2(originalAtROI30y),
    },
  };
}

