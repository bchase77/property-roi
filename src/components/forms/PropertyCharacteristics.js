import React from 'react';

export default function PropertyCharacteristics({ form, set, inputCls }) {
  return (
    <>
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
    </>
  );
}