import React from 'react';

export default function PurchaseDetails({ form, set, inputCls }) {
  return (
    <div className="space-y-3">
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
      </div>

      <div className="flex items-center space-x-3">
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
    </div>
  );
}