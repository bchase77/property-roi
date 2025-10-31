import React, { useState, useEffect } from 'react';

export default function ScenarioSelector({ onScenariosChange }) {
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/scenarios');
      if (response.ok) {
        const data = await response.json();
        setScenarios(data);
      }
    } catch (error) {
      console.error('Failed to load scenarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleScenario = (scenarioId) => {
    const newSelected = selectedScenarios.includes(scenarioId)
      ? selectedScenarios.filter(id => id !== scenarioId)
      : [...selectedScenarios, scenarioId];
    
    setSelectedScenarios(newSelected);
    
    // Get full scenario objects for the selected IDs
    const selectedScenarioObjects = scenarios.filter(s => newSelected.includes(s.id));
    onScenariosChange(selectedScenarioObjects);
  };

  const groupedScenarios = scenarios.reduce((acc, scenario) => {
    // Show baseline mortgage terms with the property address
    const baselineTerms = `${scenario.base_down_pct}% down, ${scenario.base_apr}% APR, ${scenario.base_loan_years}y`;
    const key = `${scenario.address} (${scenario.abbreviation || 'No abbrev'}) - Baseline: ${baselineTerms}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(scenario);
    return acc;
  }, {});

  if (loading) {
    return <div className="text-sm text-gray-500">Loading scenarios...</div>;
  }

  if (scenarios.length === 0) {
    return (
      <div className="bg-gray-50 rounded-lg p-4">
        <p className="text-sm text-gray-600">No scenarios found. Create scenarios for properties in the Portfolio page to see them here.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-lg font-semibold mb-3 text-gray-600">Property Scenarios</h3>
      <div className="space-y-4">
        {Object.entries(groupedScenarios).map(([propertyLabel, propertyScenarios]) => (
          <div key={propertyLabel}>
            <h4 className="text-sm font-medium text-gray-700 mb-2">{propertyLabel}</h4>
            <div className="space-y-1 ml-4">
              {propertyScenarios.map(scenario => (
                <label key={scenario.id} className="flex items-center space-x-2 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={selectedScenarios.includes(scenario.id)}
                    onChange={() => toggleScenario(scenario.id)}
                    className="rounded border-gray-300"
                  />
                  <span className="flex-1">
                    {scenario.name} ({scenario.down_pct}% down, {scenario.rate_apr}% APR, {scenario.years}y)
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}