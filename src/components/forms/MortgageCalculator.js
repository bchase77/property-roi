import React, { useState, useEffect } from 'react';
import { mortgageMonthly } from '@/lib/finance';

export default function MortgageCalculator({ form, updateForm, propertyId = null }) {
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load existing scenarios when propertyId is available
  useEffect(() => {
    if (propertyId) {
      loadScenarios();
    }
  }, [propertyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadScenarios = async () => {
    if (!propertyId) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/properties/${propertyId}/scenarios`);
      if (response.ok) {
        const data = await response.json();
        // Convert database snake_case to camelCase for React components
        const convertedScenarios = data.map(scenario => ({
          id: scenario.id,
          name: scenario.name,
          downPct: scenario.down_pct,
          rateApr: scenario.rate_apr,
          years: scenario.years,
          points: scenario.points || 0,
          closingCosts: scenario.closing_costs || 0
        }));
        setScenarios(convertedScenarios);
      }
    } catch (error) {
      console.error('Failed to load scenarios:', error);
    } finally {
      setLoading(false);
    }
  };

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const numericKeys = new Set(['downPct', 'rateApr', 'years', 'initialInvestment', 'closingCosts', 'repairCosts']);
    
    const processedValue = numericKeys.has(key) 
      ? (value === '' ? '' : Number(value)) 
      : value;
    
    updateForm({ [key]: processedValue });
  };

  const addScenario = async () => {
    // Generate a unique scenario name
    const existingNames = scenarios.map(s => s.name);
    let scenarioNumber = 1;
    let scenarioName = `Scenario ${scenarioNumber}`;
    while (existingNames.includes(scenarioName)) {
      scenarioNumber++;
      scenarioName = `Scenario ${scenarioNumber}`;
    }
    
    // Create scenario with different default values for comparison
    const baseDownPct = form.downPct;
    const scenarioDownPct = baseDownPct === 30 ? 50 : 30; // If base is 30%, suggest 50%, otherwise 30%
    
    const newScenario = {
      name: scenarioName,
      downPct: scenarioDownPct,
      rateApr: form.rateApr, // Keep same rate initially
      years: form.years,     // Keep same term initially
      points: 0,
      closingCosts: 0
    };

    if (propertyId) {
      // Save to database for existing property
      try {
        const response = await fetch(`/api/properties/${propertyId}/scenarios`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newScenario)
        });
        
        if (response.ok) {
          const savedScenario = await response.json();
          setScenarios([...scenarios, savedScenario]);
        }
      } catch (error) {
        console.error('Failed to save scenario:', error);
      }
    } else {
      // Temporary scenario for new property
      const tempScenario = { ...newScenario, id: Date.now() };
      setScenarios([...scenarios, tempScenario]);
    }
  };

  const removeScenario = async (id) => {
    // Check if this is a saved scenario (has a real database ID) vs temporary scenario (timestamp ID)
    const scenario = scenarios.find(s => s.id === id);
    const isTemporaryScenario = !scenario || id > 1000000000; // Timestamp IDs are much larger
    
    if (propertyId && !isTemporaryScenario) {
      // Delete from database for saved scenarios
      try {
        const response = await fetch(`/api/scenarios/${id}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          setScenarios(scenarios.filter(s => s.id !== id));
        } else {
          console.error('Failed to delete scenario from database');
        }
      } catch (error) {
        console.error('Failed to delete scenario:', error);
      }
    } else {
      // Remove temporary scenario (only exists in local state)
      setScenarios(scenarios.filter(s => s.id !== id));
    }
  };

  const updateScenario = async (id, updatedScenario) => {
    console.log(`🔄 Updating scenario ${id}:`, updatedScenario);
    
    // Update local state immediately for better UX
    setScenarios(scenarios.map(s => s.id === id ? updatedScenario : s));
    
    // Update database for saved scenarios (small database IDs)
    if (propertyId && typeof id === 'number' && id < 1000000) {
      console.log(`💾 Saving scenario ${id} to database...`);
    
      try {
        await fetch(`/api/scenarios/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: updatedScenario.name,
            downPct: updatedScenario.downPct,
            rateApr: updatedScenario.rateApr,
            years: updatedScenario.years,
            points: updatedScenario.points || 0,
            closingCosts: updatedScenario.closingCosts || 0
          })
        });
        console.log(`✅ Scenario ${id} saved successfully`);
      } catch (error) {
        console.error('Failed to update scenario:', error);
      }
    } else {
      console.log(`⏭️ Scenario ${id} not saved (propertyId: ${propertyId}, id type: ${typeof id}, id < 1000000: ${id < 1000000})`);
    }
  };

  const applyScenario = (scenario) => {
    // Show confirmation dialog before applying scenario to base property
    const confirmApply = window.confirm(
      `This will replace the base property's mortgage terms:\n\n` +
      `Current: ${form.downPct}% down, ${form.rateApr}% APR, ${form.years} years\n` +
      `New: ${scenario.downPct}% down, ${scenario.rateApr}% APR, ${scenario.years} years\n\n` +
      `Are you sure you want to apply this scenario to the base property?`
    );
    
    if (confirmApply) {
      updateForm({
        downPct: scenario.downPct,
        rateApr: scenario.rateApr,
        years: scenario.years
      });
    }
  };

  const calculatePayment = (principal, rate, years) => {
    if (!principal || !rate || !years) return 0;
    return mortgageMonthly(principal, rate, years);
  };

  const inputCls = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-600 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  const loanAmount = form.mortgageFree ? 0 : (form.purchasePrice - (form.purchasePrice * (form.downPct / 100)));
  const monthlyPayment = form.mortgageFree ? 0 : calculatePayment(loanAmount, form.rateApr, form.years);

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-800">Mortgage & Investment</h2>
        <span className="text-sm text-blue-600 bg-blue-50 px-2 py-1 rounded font-medium">
          Base Property
        </span>
      </div>
      
      <div className="space-y-4">
        {/* Mortgage Free Toggle */}
        <div className="flex items-center space-x-3">
          <input 
            type="checkbox" 
            id="mortgageFree"
            checked={form.mortgageFree} 
            onChange={set('mortgageFree')}
            className="rounded border-gray-300"
          />
          <label htmlFor="mortgageFree" className="text-sm font-medium text-gray-700">
            Owned Outright (No Mortgage)
          </label>
        </div>

        {!form.mortgageFree && (
          <>
            {/* Down Payment */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Down Payment (%)
              </label>
              <input 
                type="number" 
                step="0.5"
                min="0"
                max="100"
                className={inputCls} 
                value={form.downPct} 
                onChange={set('downPct')}
                placeholder="20"
              />
              <div className="text-xs text-gray-600 mt-1">
                ${((form.purchasePrice || 0) * ((form.downPct || 0) / 100)).toLocaleString()} down payment
              </div>
            </div>


            {/* Interest Rate */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Interest Rate (% APR)
              </label>
              <input 
                type="number" 
                step="0.125"
                min="0"
                max="20"
                className={inputCls} 
                value={form.rateApr} 
                onChange={set('rateApr')}
                placeholder="6.5"
              />
            </div>

            {/* Loan Term */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Loan Term (years)
              </label>
              <select 
                className={inputCls} 
                value={form.years} 
                onChange={set('years')}
              >
                <option value={15}>15 years</option>
                <option value={20}>20 years</option>
                <option value={25}>25 years</option>
                <option value={30}>30 years</option>
              </select>
            </div>

            {/* Mortgage Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Mortgage Summary</h3>
              <div className="space-y-1 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span>Loan Amount:</span>
                  <span>${loanAmount.toFixed(0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Monthly P&I:</span>
                  <span>${monthlyPayment.toFixed(0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Interest:</span>
                  <span>${((monthlyPayment * (form.years || 0) * 12) - loanAmount).toFixed(0).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Closing Costs */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Closing Costs ($)
          </label>
          <input 
            type="number" 
            step="100" 
            className={inputCls} 
            value={form.closingCosts === undefined || form.closingCosts === null ? '' : form.closingCosts} 
            onChange={set('closingCosts')}
            placeholder="3000"
          />
          <div className="text-xs text-gray-600 mt-1">
            Title, loan fees, inspections, attorney fees
          </div>
        </div>

        {/* Repair Costs */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Repair Costs ($)
          </label>
          <input 
            type="number" 
            step="100" 
            className={inputCls} 
            value={form.repairCosts === undefined || form.repairCosts === null ? '' : form.repairCosts} 
            onChange={set('repairCosts')}
            placeholder="2000"
          />
          <div className="text-xs text-gray-600 mt-1">
            Initial repairs, improvements, rehab costs
          </div>
        </div>

        {/* Additional Investment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Additional Investment ($)
          </label>
          <input 
            type="number" 
            step="100" 
            className={inputCls} 
            value={form.initialInvestment || ''} 
            onChange={set('initialInvestment')}
            placeholder="0"
          />
          <div className="text-xs text-gray-600 mt-1">
            Any extra cash invested beyond down payment, closing costs, and repairs
          </div>
        </div>

        {/* Total Cash Required Display */}
        <div className="bg-gray-50 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Cash Required (Auto-Calculated)
          </label>
          <div className="text-lg font-semibold text-gray-900">
            ${(() => {
              const downPayment = Number(form.purchasePrice || 0) * ((form.downPct || 0) / 100);
              const closingCosts = Number(form.closingCosts || 0);
              const repairCosts = Number(form.repairCosts || 0);
              return (downPayment + closingCosts + repairCosts).toLocaleString();
            })()}
          </div>
          <div className="text-xs text-gray-600 mt-1">
            Down Payment (${(Number(form.purchasePrice || 0) * ((form.downPct || 0) / 100)).toLocaleString()}) + Closing Costs (${Number(form.closingCosts || 0).toLocaleString()}) + Repairs (${Number(form.repairCosts || 0).toLocaleString()})
          </div>
        </div>

        {/* Mortgage Scenarios */}
        <div className="pt-4 border-t">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-gray-600">Compare Scenarios</h3>
            <button 
              onClick={addScenario}
              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
              title="Create a new scenario with different down payment for comparison"
            >
              + Add Scenario
            </button>
          </div>

          {scenarios.map(scenario => (
            <ScenarioCard 
              key={scenario.id}
              scenario={scenario}
              purchasePrice={form.purchasePrice}
              onApply={() => applyScenario(scenario)}
              onRemove={() => removeScenario(scenario.id)}
              onUpdate={updateScenario}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ScenarioCard({ scenario, purchasePrice, onApply, onRemove, onUpdate }) {
  const loanAmount = purchasePrice - (purchasePrice * (scenario.downPct / 100));
  const monthlyPayment = mortgageMonthly(loanAmount, scenario.rateApr, scenario.years);

  const handleChange = (field, value) => {
    onUpdate(scenario.id, { ...scenario, [field]: Number(value) });
  };

  const inputCls = "w-full text-xs px-2 py-1 border border-gray-300 rounded text-gray-900 bg-white";

  return (
    <div className="bg-gray-50 rounded-lg p-3 mb-2">
      <div className="flex justify-between items-start mb-2">
        <input 
          type="text"
          value={scenario.name}
          onChange={(e) => onUpdate(scenario.id, { ...scenario, name: e.target.value })}
          className="text-sm font-medium bg-transparent border-none p-0 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded text-gray-900"
        />
        <div className="flex space-x-1">
          <button 
            onClick={onApply}
            className="text-xs text-orange-600 hover:text-orange-800 font-medium"
            title="Replace base property values with this scenario"
          >
            ⚠️ Apply to Base
          </button>
          <button 
            onClick={onRemove}
            className="text-xs text-red-600 hover:text-red-800"
          >
            Remove
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div>
          <div className="text-gray-600 mb-1">Down %:</div>
          <input 
            type="number"
            step="0.5"
            value={scenario.downPct || ''}
            onChange={(e) => handleChange('downPct', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <div className="text-gray-600 mb-1">Rate %:</div>
          <input 
            type="number"
            step="0.125"
            value={scenario.rateApr || ''}
            onChange={(e) => handleChange('rateApr', e.target.value)}
            className={inputCls}
          />
        </div>
        <div>
          <div className="text-gray-600 mb-1">Years:</div>
          <input 
            type="number"
            value={scenario.years || ''}
            onChange={(e) => handleChange('years', e.target.value)}
            className={inputCls}
          />
        </div>
      </div>
      
      <div className="mt-2 text-xs text-gray-600 text-center">
        Payment: <span className="font-medium">${monthlyPayment.toLocaleString()}</span>
      </div>
    </div>
  );
}