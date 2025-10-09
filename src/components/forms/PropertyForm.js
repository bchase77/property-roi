import React from 'react';

export default function PropertyForm({ form, updateForm, onSubmit, onReset, saving }) {
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const numericKeys = new Set([
      'purchasePrice', 'downPct', 'rateApr', 'years', 'monthlyRent', 
      'taxPct', 'taxAnnual', 'hoaMonthly', 'insuranceMonthly', 'maintPctRent', 
      'vacancyPctRent', 'mgmtPctRent', 'otherMonthly', 'yearPurchased', 
      'initialInvestment'
    ]);
    
    const processedValue = numericKeys.has(key) 
      ? (value === '' ? '' : Number(value)) 
      : value;
    
    updateForm({ [key]: processedValue });
  };

  const inputCls = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Property Details</h2>
      
      <form onSubmit={onSubmit} className="space-y-4">
        {/* Address */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Property Address *
          </label>
          <input 
            className={inputCls} 
            value={form.address} 
            onChange={set('address')} 
            placeholder="123 Main Street"
            required 
          />
        </div>

        {/* City, State, ZIP */}
        <div className="grid grid-cols-3 gap-2">
          <input 
            placeholder="City" 
            className={inputCls} 
            value={form.city} 
            onChange={set('city')} 
          />
          <input 
            placeholder="State" 
            className={inputCls} 
            value={form.state} 
            onChange={set('state')} 
          />
          <input 
            placeholder="ZIP" 
            className={inputCls} 
            value={form.zip} 
            onChange={set('zip')} 
          />
        </div>

        {/* Purchase Price */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Purchase Price ($)
          </label>
          <input 
            type="number" 
            step="1000"
            className={inputCls} 
            value={form.purchasePrice} 
            onChange={set('purchasePrice')}
            placeholder="500000"
          />
        </div>

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

        {/* Property Characteristics */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
            <input 
              type="number"
              min="0"
              className={inputCls} 
              value={form.bedrooms || ''} 
              onChange={set('bedrooms')}
              placeholder="3"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
            <input 
              type="number"
              step="0.5"
              min="0"
              className={inputCls} 
              value={form.bathrooms || ''} 
              onChange={set('bathrooms')}
              placeholder="2.5"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Square Footage</label>
            <input 
              type="number"
              min="0"
              className={inputCls} 
              value={form.squareFootage || ''} 
              onChange={set('squareFootage')}
              placeholder="2000"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Year Built</label>
            <input 
              type="number"
              min="1800"
              max="2030"
              className={inputCls} 
              value={form.yearBuilt || ''} 
              onChange={set('yearBuilt')}
              placeholder="1995"
            />
          </div>
        </div>

        {/* Zillow ZPID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Zillow ZPID (Optional)
          </label>
          <input 
            type="text"
            className={inputCls} 
            value={form.zillowZpid || ''} 
            onChange={set('zillowZpid')}
            placeholder="123456789"
          />
          <div className="text-xs text-gray-600 mt-1">
            8-10 digit ID from Zillow URL for market value lookup
          </div>
        </div>

        {/* Operating Expenses */}
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

        {/* Purchase Status */}
        <div className="space-y-3">
          <div className="flex items-center space-x-3">
            <input 
              type="checkbox" 
              id="purchased"
              checked={form.purchased} 
              onChange={set('purchased')}
              className="rounded border-gray-300"
            />
            <label htmlFor="purchased" className="text-sm font-medium text-gray-700">
              Already Purchased
            </label>
          </div>

          {form.purchased && (
            <div>
              <label className="block text-xs text-gray-600 mb-1">Year Purchased</label>
              <input 
                type="number" 
                min="1900"
                max="2030"
                className="w-32 rounded-md border border-gray-300 text-gray-600 px-3 py-2" 
                value={form.yearPurchased} 
                onChange={set('yearPurchased')}
                placeholder="2023"
              />
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Property'}
          </button>
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </form>
    </div>
  );
}