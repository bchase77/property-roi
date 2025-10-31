// Calculate rent increase patterns and projections based on historical data

export function analyzeRentIncreases(historicalData, state) {
  // Group properties by state
  const stateProperties = historicalData.filter(record => record.state === state);
  
  if (stateProperties.length === 0) return null;
  
  // Calculate year-over-year increases for each property
  const rentIncreases = [];
  
  // Group by property
  const propertiesByProperty = {};
  stateProperties.forEach(record => {
    if (!propertiesByProperty[record.property_id]) {
      propertiesByProperty[record.property_id] = [];
    }
    propertiesByProperty[record.property_id].push(record);
  });
  
  // Calculate YoY increases for each property
  Object.values(propertiesByProperty).forEach(propertyRecords => {
    propertyRecords.sort((a, b) => a.year - b.year);
    
    for (let i = 1; i < propertyRecords.length; i++) {
      const prevYear = propertyRecords[i - 1];
      const currentYear = propertyRecords[i];
      
      if (prevYear.gross_income > 0 && currentYear.gross_income > 0) {
        const increase = (currentYear.gross_income - prevYear.gross_income) / prevYear.gross_income;
        rentIncreases.push({
          propertyId: currentYear.property_id,
          year: currentYear.year,
          increase: increase,
          prevIncome: prevYear.gross_income,
          currentIncome: currentYear.gross_income
        });
      }
    }
  });
  
  if (rentIncreases.length === 0) return null;
  
  // Calculate average increase for the state
  const avgIncrease = rentIncreases.reduce((sum, inc) => sum + inc.increase, 0) / rentIncreases.length;
  
  // Calculate median increase
  const sortedIncreases = rentIncreases.map(inc => inc.increase).sort((a, b) => a - b);
  const medianIncrease = sortedIncreases[Math.floor(sortedIncreases.length / 2)];
  
  // Calculate increase frequency (how often rents increase)
  const totalYears = rentIncreases.length;
  const positiveIncreases = rentIncreases.filter(inc => inc.increase > 0.01).length; // More than 1%
  const increaseFrequency = positiveIncreases / totalYears;
  
  return {
    state,
    avgAnnualIncrease: avgIncrease,
    medianAnnualIncrease: medianIncrease,
    increaseFrequency,
    totalDataPoints: rentIncreases.length,
    rentIncreases // Raw data for debugging
  };
}

// Calculate rent projections for next 5 years
export function projectRent(currentRent, state, stateRentData) {
  if (!stateRentData) {
    // Fallback: use national averages
    return projectRentWithDefaults(currentRent);
  }
  
  const projections = [];
  let rent = currentRent;
  
  // Use median increase as it's more conservative than average
  const annualIncreaseRate = stateRentData.medianAnnualIncrease;
  
  // Apply increases every 2 years as per user request
  for (let year = 1; year <= 5; year++) {
    if (year % 2 === 0) { // Every 2 years
      rent = rent * (1 + annualIncreaseRate);
    }
    
    projections.push({
      year: 2025 + year,
      projectedRent: Math.round(rent),
      increaseApplied: year % 2 === 0
    });
  }
  
  return projections;
}

function projectRentWithDefaults(currentRent) {
  // Default 3% increase every 2 years if no historical data
  const projections = [];
  let rent = currentRent;
  const defaultIncreaseRate = 0.03;
  
  for (let year = 1; year <= 5; year++) {
    if (year % 2 === 0) {
      rent = rent * (1 + defaultIncreaseRate);
    }
    
    projections.push({
      year: 2025 + year,
      projectedRent: Math.round(rent),
      increaseApplied: year % 2 === 0
    });
  }
  
  return projections;
}

// Create early payoff scenarios
export function createPayoffScenarios(property) {
  const scenarios = [];
  const currentYear = 2025;
  
  // Current payoff date scenario
  if (property.mortgage_payoff_date) {
    const payoffYear = new Date(property.mortgage_payoff_date).getFullYear();
    if (payoffYear > currentYear) {
      scenarios.push({
        name: 'Current Schedule',
        payoffYear: payoffYear,
        description: `Mortgage paid off as scheduled in ${payoffYear}`
      });
    }
  }
  
  // Early payoff scenarios (1, 3, 5 years early)
  const currentPayoffYear = property.mortgage_payoff_date ? 
    new Date(property.mortgage_payoff_date).getFullYear() : currentYear + 10;
  
  [1, 3, 5].forEach(yearsEarly => {
    const earlyPayoffYear = currentPayoffYear - yearsEarly;
    if (earlyPayoffYear > currentYear) {
      scenarios.push({
        name: `${yearsEarly} Year${yearsEarly > 1 ? 's' : ''} Early`,
        payoffYear: earlyPayoffYear,
        description: `Pay off mortgage ${yearsEarly} year${yearsEarly > 1 ? 's' : ''} early in ${earlyPayoffYear}`
      });
    }
  });
  
  return scenarios;
}

// Calculate projected metrics with payoff scenarios
export function calculateProjectedMetrics(property, rentProjections, payoffScenario, stateRentData) {
  const currentYear = 2025;
  const projections = [];
  
  // Get current metrics as baseline
  const currentRent = Number(property.current_rent_monthly || property.monthly_rent) || 0;
  const currentExpenses = Number(property.current_expenses_annual || 0) / 12;
  const mortgagePayment = Number(property.current_mortgage_payment || 0);
  
  for (let year = 1; year <= 5; year++) {
    const projectionYear = currentYear + year;
    const rentProjection = rentProjections.find(r => r.year === projectionYear);
    const projectedRent = rentProjection ? rentProjection.projectedRent : currentRent;
    
    // Determine if mortgage is paid off this year
    const mortgagePaidOff = projectionYear >= payoffScenario.payoffYear;
    const monthlyMortgage = mortgagePaidOff ? 0 : mortgagePayment;
    
    // Project expenses to increase with inflation (2% annually)
    const inflationRate = 0.02;
    const projectedExpenses = currentExpenses * Math.pow(1 + inflationRate, year);
    
    // Calculate metrics
    const monthlyNOI = projectedRent - projectedExpenses;
    const monthlyCashFlow = monthlyNOI - monthlyMortgage;
    const annualCashFlow = monthlyCashFlow * 12;
    
    // Calculate cash-on-cash return
    const initialInvestment = Number(property.initial_investment) || 
      (Number(property.purchase_price) * (Number(property.down_payment_pct) || 20) / 100);
    const cashOnCash = initialInvestment > 0 ? (annualCashFlow / initialInvestment) * 100 : 0;
    
    projections.push({
      year: projectionYear,
      projectedRent,
      projectedExpenses: Math.round(projectedExpenses),
      monthlyNOI: Math.round(monthlyNOI),
      monthlyCashFlow: Math.round(monthlyCashFlow),
      annualCashFlow: Math.round(annualCashFlow),
      cashOnCash: Math.round(cashOnCash * 100) / 100,
      mortgagePaidOff,
      payoffScenario: payoffScenario.name
    });
  }
  
  return projections;
}