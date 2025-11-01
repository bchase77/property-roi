import React, { useState, useEffect } from 'react';
import { mortgageMonthly } from '@/lib/finance';

export default function MortgageCalculator({ form, updateForm, propertyId = null }) {
  const [scenarios, setScenarios] = useState([]);

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
    const numericKeys = new Set(['downPct', 'rateApr', 'years', 'initialInvestment']);
    
    const processedValue = numericKeys.has(key) 
      ? (value === '' ? '' : Number(value)) 
      : value;
    
    updateForm({ [key]: processedValue });
  };

  const addScenario = async () => {
    const newScenario = {
      name: `Scenario ${scenarios.length + 1}`,
      downPct: form.downPct,
      rateApr: form.rateApr,
      years: form.years,
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
    if (propertyId && typeof id === 'number' && id > 1000000) {
      // Delete from database for saved scenarios
      try {
        const response = await fetch(`/api/scenarios/${id}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          setScenarios(scenarios.filter(s => s.id !== id));
        }
      } catch (error) {
        console.error('Failed to delete scenario:', error);
      }
    } else {
      // Remove temporary scenario
      setScenarios(scenarios.filter(s => s.id !== id));
    }
  };

  const updateScenario = async (id, updatedScenario) => {
    // Update local state immediately for better UX
    setScenarios(scenarios.map(s => s.id === id ? updatedScenario : s));
    
    // Update database for saved scenarios
    if (propertyId && typeof id === 'number' && id > 1000000) {
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
      } catch (error) {
        console.error('Failed to update scenario:', error);
      }
    }
  };

  const applyScenario = (scenario) => {
    updateForm({
      downPct: scenario.downPct,
      rateApr: scenario.rateApr,
      years: scenario.years
    });
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
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Mortgage & Investment</h2>
      
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

        {/* Initial Investment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Total Initial Investment ($)
          </label>
          <input 
            type="number" 
            step="1000"
            className={inputCls} 
            value={form.initialInvestment} 
            onChange={set('initialInvestment')}
            placeholder={form.mortgageFree ? form.purchasePrice : (form.purchasePrice || 0) * ((form.downPct || 0) / 100)}
          />
          <div className="text-xs text-gray-600 mt-1">
            Include down payment, closing costs, repairs, etc.
          </div>
        </div>

        {/* Mortgage Scenarios */}
        <div className="pt-4 border-t">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-sm font-medium text-gray-600">Compare Scenarios</h3>
            <button 
              onClick={addScenario}
              className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200"
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
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            Apply
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