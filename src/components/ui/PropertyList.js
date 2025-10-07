import React from 'react';
import { analyzeWithCurrentValues } from '@/lib/finance';

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
  const metrics = analyzeWithCurrentValues(property);
  
  // Debug logging for properties with current values
  if (property.address?.includes('6386 Midsummer') || property.address?.includes('5339 Lexie')) {
    console.log(`${property.address} Debug:`, {
      rent: property.current_rent_monthly || property.monthly_rent,
      maintenance_pct: property.maintenance_pct_rent,
      vacancy_pct: property.vacancy_pct_rent,
      management_pct: property.current_management_pct || property.management_pct_rent,
      current_expenses: property.current_expenses_annual,
      appraisal_value: property.current_appraisal_value,
      county_tax_rate: property.current_county_tax_rate,
      city_tax_rate: property.current_city_tax_rate,
      assessment_pct: property.assessment_percentage,
      cashflow: metrics.cashflowMonthly,
      taxesMonthly: metrics.taxesMonthly,
      operatingExpenses: metrics.operatingExpenses
    });
  }
  
  // Determine data source for display
  const currentRent = property.current_rent_monthly || property.monthly_rent;
  const usingCurrentValues = !!(property.current_rent_monthly || property.current_appraisal_value || property.current_market_value);
  const dataSource = usingCurrentValues ? "Current Values" : "Purchase Data";

  return (
    <div className={`rounded-lg border p-4 ${isEditing ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white'}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <h3 className="font-medium text-gray-900">
            {property.address}
            {property.abbreviation && <span className="ml-2 text-blue-600">({property.abbreviation})</span>}
          </h3>
          <p className="text-sm text-gray-500 mb-2">
            {property.city}, {property.state} {property.zip}
          </p>
          {property.purchased && property.year_purchased && (
            <p className="text-xs text-blue-600 mb-2">
              Purchased: {property.month_purchased ? 
                `${new Date(0, property.month_purchased - 1).toLocaleString('default', { month: 'short' })} ${property.year_purchased}` : 
                property.year_purchased
              }
            </p>
          )}
          
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Purchase Price:</div>
              <div className="font-medium text-green-600">${Number(property.purchase_price).toLocaleString()}</div>
              {property.current_market_value && (
                <div className="text-xs text-blue-600">
                  Current: ${Number(property.current_market_value).toLocaleString()}
                </div>
              )}
            </div>
            <div>
              <div className="text-gray-600">Monthly Rent:</div>
              <div className="font-medium text-green-600">${Number(currentRent).toLocaleString()}</div>
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
              <div className={`font-medium text-xs ${(metrics.cashflowMonthly * 12) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${(metrics.cashflowMonthly * 12).toLocaleString()}/yr
              </div>
            </div>
          </div>
          
          {/* Data Source Indicator and Ownership Status */}
          <div className="mt-3 pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <div className={`inline-block px-2 py-1 text-xs rounded ${
              usingCurrentValues 
                ? 'bg-green-100 text-green-700' 
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              Metrics from: {dataSource}
            </div>
            {property.mortgage_free && (
              <div className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                Owned Outright
              </div>
            )}
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
    </div>
  );
}