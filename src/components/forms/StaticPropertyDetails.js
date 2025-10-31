import React from 'react';

export default function StaticPropertyDetails({ form, updateForm, inputCls, saving }) {
  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const numericKeys = new Set([
      'purchasePrice', 'bedrooms', 'bathrooms', 'squareFootage', 'yearBuilt', 'yearPurchased'
    ]);
    
    const processedValue = numericKeys.has(key) 
      ? (value === '' ? '' : Number(value)) 
      : value;
    
    updateForm({ [key]: processedValue });
  };

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Property Details</h2>
      <p className="text-sm text-gray-600 mb-4">Basic property information that doesn't change often</p>
      
      <div className="space-y-4">
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

        {/* Property Characteristics */}
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Bedrooms</label>
            <input 
              type="number" 
              min="0"
              step="1"
              className={inputCls} 
              value={form.bedrooms} 
              onChange={set('bedrooms')}
              placeholder="3"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Bathrooms</label>
            <input 
              type="number" 
              min="0"
              step="0.5"
              className={inputCls} 
              value={form.bathrooms} 
              onChange={set('bathrooms')}
              placeholder="2.5"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Square Feet</label>
            <input 
              type="number" 
              min="0"
              step="50"
              className={inputCls} 
              value={form.squareFootage} 
              onChange={set('squareFootage')}
              placeholder="1800"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Year Built</label>
            <input 
              type="number" 
              min="1800"
              max="2030"
              step="1"
              className={inputCls} 
              value={form.yearBuilt} 
              onChange={set('yearBuilt')}
              placeholder="1995"
            />
          </div>
        </div>

        {/* Zillow ZPID */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Zillow ZPID</label>
          <input 
            className={inputCls}
            value={form.zillowZpid || ''}
            onChange={set('zillowZpid')}
            placeholder="Enter Zillow Property ID for automatic value updates"
          />
          <div className="text-xs text-gray-500 mt-1">
            Find this on the Zillow property page URL (e.g., zillow.com/homedetails/123-main-st/12345_zpid/)
          </div>
        </div>

        {/* Purchase Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Purchase Date</label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Year</label>
              <input 
                type="number" 
                min="1900"
                max="2035"
                className="w-full rounded-md border border-gray-300 text-gray-600 px-3 py-2" 
                value={form.yearPurchased} 
                onChange={set('yearPurchased')}
                placeholder="2025"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Month</label>
              <select 
                className="w-full rounded-md border text-gray-600 border-gray-300 px-3 py-2"
                value={form.monthPurchased || ''}
                onChange={set('monthPurchased')}
              >
                <option value="">Select month</option>
                <option value="1">January</option>
                <option value="2">February</option>
                <option value="3">March</option>
                <option value="4">April</option>
                <option value="5">May</option>
                <option value="6">June</option>
                <option value="7">July</option>
                <option value="8">August</option>
                <option value="9">September</option>
                <option value="10">October</option>
                <option value="11">November</option>
                <option value="12">December</option>
              </select>
            </div>
          </div>
          <div className="flex items-center space-x-3 mt-2">
            <input 
              type="checkbox" 
              id="purchased"
              checked={form.purchased} 
              onChange={set('purchased')}
              className="rounded border-gray-300"
            />
            <label htmlFor="purchased" className="text-sm font-medium text-gray-700">
              Purchase completed (uncheck if projected/future purchase)
            </label>
          </div>
        </div>

        {/* Mortgage Status */}
        <div className="flex items-center space-x-3">
          <input 
            type="checkbox" 
            id="mortgageFree"
            checked={form.mortgageFree} 
            onChange={set('mortgageFree')}
            className="rounded border-gray-300"
          />
          <label htmlFor="mortgageFree" className="text-sm font-medium text-gray-700">
            Mortgage-Free (Owned Outright)
          </label>
        </div>

        {/* Tax Website Links */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-700">Tax Assessment Links</h3>
          <div>
            <label className="block text-xs text-gray-600 mb-1">County Tax Website</label>
            <div className="flex gap-2">
              <input 
                type="url"
                className={inputCls + ' flex-1'}
                value={form.countyTaxWebsite || ''}
                onChange={set('countyTaxWebsite')}
                placeholder="https://countytaxes.gov/property-search"
              />
              {form.countyTaxWebsite && (
                <button
                  type="button"
                  onClick={() => window.open(form.countyTaxWebsite, '_blank')}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  title="Open county tax website"
                >
                  🔗
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">City Tax Website</label>
            <div className="flex gap-2">
              <input 
                type="url"
                className={inputCls + ' flex-1'}
                value={form.cityTaxWebsite || ''}
                onChange={set('cityTaxWebsite')}
                placeholder="https://citytaxes.gov/property-lookup"
              />
              {form.cityTaxWebsite && (
                <button
                  type="button"
                  onClick={() => window.open(form.cityTaxWebsite, '_blank')}
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  title="Open city tax website"
                >
                  🔗
                </button>
              )}
            </div>
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
      </div>
    </div>
  );
}