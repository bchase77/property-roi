import React from 'react';
import { analyze } from '@/lib/finance';

export default function PropertyList({ properties, onEdit, onDelete, editingId }) {
  return (
    <div className="space-y-3">
      {properties.map(property => (
        <PropertyCard 
          key={property.id}
          property={property}
          onEdit={() => onEdit(property)}
          onDelete={() => onDelete(property.id)}
          isEditing={editingId === property.id}
        />
      ))}
    </div>
  );
}

function PropertyCard({ property, onEdit, onDelete, isEditing }) {
  const metrics = analyze({
    purchasePrice: Number(property.purchase_price),
    downPct: Number(property.down_payment_pct || 20),
    rateApr: Number(property.interest_apr_pct || 6.5),
    years: Number(property.loan_years || 30),
    monthlyRent: Number(property.monthly_rent),
    taxPct: Number(property.property_tax_pct || 1.2),
    hoaMonthly: Number(property.hoa_monthly || 0),
    insuranceMonthly: Number(property.insurance_monthly || 120),
    maintPctRent: Number(property.maintenance_pct_rent || 5),
    vacancyPctRent: Number(property.vacancy_pct_rent || 5),
    mgmtPctRent: Number(property.management_pct_rent || 8),
    otherMonthly: Number(property.other_monthly || 0),
    initialInvestment: Number(property.initial_investment || 0),
    mortgageFree: Boolean(property.mortgage_free)
  });

  return (
    <div className={`rounded-lg border p-4 ${isEditing ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">{property.address}</h3>
          <p className="text-sm text-gray-500 mb-2">
            {property.city}, {property.state} {property.zip}
          </p>
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Purchase Price:</div>
              <div className="font-medium text-green-600">${Number(property.purchase_price).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-600">Monthly Rent:</div>
              <div className="font-medium text-green-600">${Number(property.monthly_rent).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-600">Cap Rate:</div>
              <div className="font-medium text-green-600">{metrics.metrics.capRate.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-gray-600">Cash Flow:</div>
              <div className={`font-medium ${metrics.cashflowMonthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${metrics.cashflowMonthly.toLocaleString()}/mo
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex space-x-2 ml-4">
          <button 
            onClick={onEdit}
            className={`px-3 py-1 text-sm rounded border ${
              isEditing 
                ? 'bg-blue-600 text-white border-blue-600' 
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {isEditing ? 'Editing' : 'Edit'}
          </button>
          <button 
            onClick={onDelete}
            className="px-3 py-1 text-sm rounded border border-red-300 text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        </div>
      </div>
      
      {property.mortgage_free && (
        <div className="mt-2 inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
          Owned Outright
        </div>
      )}
    </div>
  );
}