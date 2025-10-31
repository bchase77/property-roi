import React from 'react';

export default function AnnualVariables({ form, updateForm, inputCls, saving }) {
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const numericKeys = new Set([
      'monthlyRent', 'taxPct', 'taxAnnual', 'hoaMonthly', 'insuranceMonthly', 
      'maintPctRent', 'vacancyPctRent', 'mgmtPctRent', 'otherMonthly', 'initialInvestment'
    ]);
    
    const processedValue = numericKeys.has(key) 
      ? (value === '' ? '' : Number(value)) 
      : value;
    
    updateForm({ [key]: processedValue });
  };

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Annual Variables</h2>
      <p className="text-sm text-gray-600 mb-4">Values that typically change yearly (rent, taxes, insurance, etc.)</p>
      
      <div className="space-y-6">
        {/* Monthly Rent */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Monthly Rent ($)
          </label>
          <input 
            type="number" 
            step="50"
            className={inputCls} 
            value={form.monthlyRent} 
            onChange={set('monthlyRent')}
            placeholder="2800"
          />
        </div>

        {/* Property Taxes - Combined Area */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Property Taxes (projected)</h3>
          
          {/* Tax Input Mode Toggle */}
          <div className="flex items-center gap-4 mb-2">
            <label className="flex items-center">
              <input 
                type="radio" 
                name="taxInputMode"
                value="percentage" 
                checked={form.taxInputMode === 'percentage'}
                onChange={set('taxInputMode')}
                className="mr-2"
              />
              <span className="text-sm text-gray-600">Percentage</span>
            </label>
            <label className="flex items-center">
              <input 
                type="radio" 
                name="taxInputMode"
                value="annual" 
                checked={form.taxInputMode === 'annual'}
                onChange={set('taxInputMode')}
                className="mr-2"
              />
              <span className="text-sm text-gray-600">Annual Amount</span>
            </label>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div>
              {form.taxInputMode === 'percentage' ? (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tax Rate (%)</label>
                  <input 
                    type="number" 
                    step="0.1"
                    className={inputCls} 
                    value={form.taxPct} 
                    onChange={set('taxPct')}
                    placeholder="1.2"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Annual Tax ($)</label>
                  <input 
                    type="number" 
                    step="100"
                    className={inputCls} 
                    value={form.taxAnnual} 
                    onChange={set('taxAnnual')}
                    placeholder="6000"
                  />
                  <div className="text-xs text-gray-500 mt-1">Enter 0 to use %</div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Insurance ($/mo)</label>
              <input 
                type="number" 
                step="10"
                className={inputCls} 
                value={form.insuranceMonthly} 
                onChange={set('insuranceMonthly')}
                placeholder="120"
              />
            </div>
          </div>
        </div>

        {/* Other Monthly Expenses */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">HOA ($/mo)</label>
            <input 
              type="number" 
              step="10"
              className={inputCls} 
              value={form.hoaMonthly} 
              onChange={set('hoaMonthly')}
              placeholder="0"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Other ($/mo)</label>
            <input 
              type="number" 
              step="10"
              className={inputCls} 
              value={form.otherMonthly} 
              onChange={set('otherMonthly')}
              placeholder="0"
            />
          </div>
        </div>

        {/* Percentage-based Expenses */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Maintenance (% rent)</label>
            <input 
              type="number" 
              step="0.5"
              className={inputCls} 
              value={form.maintPctRent} 
              onChange={set('maintPctRent')}
              placeholder="5"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Vacancy (% rent)</label>
            <input 
              type="number" 
              step="0.5"
              className={inputCls} 
              value={form.vacancyPctRent} 
              onChange={set('vacancyPctRent')}
              placeholder="5"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Management (% rent)</label>
            <input 
              type="number" 
              step="0.5"
              className={inputCls} 
              value={form.mgmtPctRent} 
              onChange={set('mgmtPctRent')}
              placeholder="8"
            />
          </div>
        </div>

        {/* Initial Investment */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Initial Investment ($)
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
      </div>
    </div>
  );
}