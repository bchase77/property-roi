import React from 'react';

export default function PropertySelector({ properties, selectedProperties, onToggleProperty }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-lg font-semibold mb-4 text-gray-600">Select Properties to Analyze</h2>
      
      {properties.length === 0 ? (
        <p className="text-gray-700 text-center py-4">No properties found. Add some properties first.</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          {properties.map(property => (
            <PropertyCard 
              key={property.id}
              property={property}
              isSelected={selectedProperties.some(p => p.id === property.id)}
              onToggle={() => onToggleProperty(property)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PropertyCard({ property, isSelected, onToggle }) {
  return (
    <div 
      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
        isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center space-x-2">
        <input 
          type="checkbox" 
          checked={isSelected}
          onChange={() => {}} // handled by parent onClick
          className="rounded"
        />
        <div className="flex-1">
          <div className="font-medium text-sm text-gray-900">{property.address}</div>
          <div className="text-xs text-gray-500 mb-1">{property.city}, {property.state}</div>
          <div className="text-xs text-gray-700">
            ${Number(property.purchase_price).toLocaleString()} • 
            ${Number(property.monthly_rent).toLocaleString()}/mo
          </div>
        </div>
      </div>
    </div>
  );
}