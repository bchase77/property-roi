import React from 'react';
import PropertyCharacteristics from './PropertyCharacteristics';
import OperatingExpenses from './OperatingExpenses';
import PurchaseDetails from './PurchaseDetails';

export default function PropertyForm({ form, updateForm, onSubmit, onReset, saving }) {
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const numericKeys = new Set([
      'purchasePrice', 'downPct', 'rateApr', 'years', 'monthlyRent', 
      'taxPct', 'taxAnnual', 'hoaMonthly', 'insuranceMonthly', 'maintPctRent', 
      'vacancyPctRent', 'mgmtPctRent', 'otherMonthly', 'yearPurchased', 
      'initialInvestment', 'bedrooms', 'bathrooms', 'squareFootage', 'yearBuilt'
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

        {/* Chart Abbreviation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chart Abbreviation</label>
          <input 
            className={inputCls}
            value={form.abbreviation || ''}
            onChange={set('abbreviation')}
            placeholder="e.g., TLK, Hunt, Kings"
            maxLength="10"
          />
          <div className="text-xs text-gray-500 mt-1">
            Short name for charts (optional). If empty, house number will be used.
          </div>
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

        <PropertyCharacteristics form={form} set={set} inputCls={inputCls} />

        <OperatingExpenses form={form} set={set} inputCls={inputCls} />

        <PurchaseDetails form={form} set={set} inputCls={inputCls} />

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

        {/* Tax Website Links */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Tax Assessment Links</h3>
          <div>
            <label className="block text-xs text-gray-600 mb-1">County Tax Website</label>
            <input 
              type="url"
              className={inputCls}
              value={form.countyTaxWebsite || ''}
              onChange={set('countyTaxWebsite')}
              placeholder="https://countytaxes.gov/property-search"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">City Tax Website</label>
            <input 
              type="url"
              className={inputCls}
              value={form.cityTaxWebsite || ''}
              onChange={set('cityTaxWebsite')}
              placeholder="https://citytaxes.gov/property-lookup"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea 
            className={inputCls + ' min-h-[80px] resize-y'}
            value={form.notes || ''}
            onChange={set('notes')}
            placeholder="Property notes, important details, maintenance history, etc."
            rows="3"
          />
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