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

export function mergePropertiesAndScenarios(properties, scenarios) {
  const virtualProperties = convertScenariosToVirtualProperties(scenarios, properties);
  return [...properties, ...virtualProperties];
}