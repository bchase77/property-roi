import React from 'react';

export default function OperatingExpenses({ form, set, inputCls }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-900">Operating Expenses</h3>
      
      {/* Property Tax Input Mode Toggle */}
      <div>
        <label className="block text-xs text-gray-600 mb-2">Property Tax</label>
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
    </div>
  );
}