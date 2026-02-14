// Helper functions for converting scenarios to chart-compatible data

export function createVirtualPropertyFromScenario(scenario, baseProperty) {
  // Create a "virtual property" by combining the base property data with scenario overrides
  const scenarioDownPct = scenario.down_pct || scenario.downPct;
  const purchasePrice = Number(baseProperty.purchase_price) || 0;
  
  // Calculate new initial investment based on scenario down payment percentage
  const scenarioInitialInvestment = purchasePrice * (scenarioDownPct / 100);
  
  const virtualProperty = {
    ...baseProperty,
    // Override key financial parameters from scenario
    down_payment_pct: scenarioDownPct,
    interest_apr_pct: scenario.rate_apr || scenario.rateApr,
    loan_years: scenario.years,
    // Update initial investment to match new down payment
    initial_investment: scenarioInitialInvestment,
    // Create unique identifier and display name for charts
    id: `scenario_${scenario.id}_${baseProperty.id}`,
    address: `${baseProperty.address} (${scenario.name})`,
    abbreviation: `${baseProperty.abbreviation || 'SC'}-${scenario.name.replace(/\s+/g, '')}`,
    // Mark as scenario for special handling
    isScenario: true,
    scenarioId: scenario.id,
    basePropertyId: baseProperty.id,
    scenarioName: scenario.name
  };
  
  
  return virtualProperty;
}

export function convertScenariosToVirtualProperties(scenarios, allProperties) {
  const virtualProperties = [];
  
  scenarios.forEach(scenario => {
    // Find the base property for this scenario
    const baseProperty = allProperties.find(prop => 
      prop.id === scenario.property_id || 
      prop.id === scenario.propertyId
    );
    
    if (baseProperty) {
      const virtualProperty = createVirtualPropertyFromScenario(scenario, baseProperty);
      virtualProperties.push(virtualProperty);
    }
  });
  
  return virtualProperties;
}

// Create automatic 100% down payment (cash purchase) scenario for projected properties
export function createCashPurchaseScenario(property) {
  // Only create for unpurchased properties that have a down payment < 100%
  if (property.purchased || !property.down_payment_pct || Number(property.down_payment_pct) >= 100) {
    return null;
  }

  const purchasePrice = Number(property.purchase_price) || 0;
  const closingCosts = Number(property.closing_costs) || 0;
  const repairCosts = Number(property.repair_costs) || 0;

  return {
    ...property,
    // 100% down payment scenario (cash purchase)
    down_payment_pct: 100,
    // Initial investment is full purchase price + closing costs + repairs
    initial_investment: purchasePrice + closingCosts + repairCosts,
    // Mark as mortgage-free
    mortgage_free: true,
    // Create unique identifier and display name for charts
    id: `cashpurchase_${property.id}`,
    address: `${property.address} (Cash Purchase)`,
    abbreviation: `${property.abbreviation || property.address?.substring(0, 3) || 'CP'}-100%`,
    // Mark as cash purchase scenario
    isCashPurchaseScenario: true,
    basePropertyId: property.id,
    scenarioName: 'Cash Purchase'
  };
}

export function addCashPurchaseScenarios(properties) {
  const cashPurchaseScenarios = [];
  
  properties.forEach(property => {
    const cashPurchaseScenario = createCashPurchaseScenario(property);
    if (cashPurchaseScenario) {
      cashPurchaseScenarios.push(cashPurchaseScenario);
    }
  });
  
  return cashPurchaseScenarios;
}

export function mergePropertiesAndScenarios(properties, scenarios, includeCashPurchase = false) {
  const virtualProperties = convertScenariosToVirtualProperties(scenarios, properties);
  
  if (includeCashPurchase) {
    const cashPurchaseScenarios = addCashPurchaseScenarios(properties);
    return [...properties, ...virtualProperties, ...cashPurchaseScenarios];
  }
  
  return [...properties, ...virtualProperties];
}