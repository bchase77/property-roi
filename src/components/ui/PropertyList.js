import React from 'react';
import { analyzeWithCurrentValues } from '@/lib/finance';

export default function PropertyList({ properties, onEdit, onDelete, onArchive, editingId }) {
  return (
    <div className="space-y-3">
      {properties.map(property => (
        <PropertyCard 
          key={property.id}
          property={property}
          onEdit={() => onEdit(property)}
          onDelete={() => onDelete(property.id)}
          onArchive={() => onArchive(property.id)}
          isEditing={editingId === property.id}
        />
      ))}
    </div>
  );
}

function PropertyCard({ property, onEdit, onDelete, onArchive, isEditing }) {
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

  // Determine ownership status styling
  const isOwned = property.purchased;
  const borderClass = isEditing ? 'border-blue-500 bg-blue-50' : 
                     isOwned ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50';

  return (
    <div className={`rounded-lg border p-4 ${borderClass}`}>
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-medium text-gray-900">
              {property.address}
              {property.abbreviation && <span className="ml-2 text-blue-600">({property.abbreviation})</span>}
            </h3>
            <div className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
              isOwned 
                ? 'bg-green-100 text-green-800 border border-green-200' 
                : 'bg-orange-100 text-orange-800 border border-orange-200'
            }`}>
              {isOwned ? '✅ OWNED' : '📊 PROJECTED'}
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-2">
            {property.city}, {property.state} {property.zip}
          </p>
          {property.purchased && (
            <p className="text-xs text-blue-600 mb-2">
              Purchased: {property.month_purchased ? 
                `${new Date(0, property.month_purchased - 1).toLocaleString('default', { month: 'short' })} ${property.year_purchased}` : 
                property.year_purchased
              }
            </p>
          )}
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
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
            <div>
              <div className="text-gray-600">
                30y ATROI:
                <span className="text-xs text-gray-500 ml-1" title="30-Year Average Total Return on Investment: Your conservative formula without appreciation or inflation.">ⓘ</span>
              </div>
              {(() => {
                // Calculate 30yATROI using original values when available (same logic as FinancialPreview)
                const hasOriginalValues = !!(property.original_monthly_rent || property.original_property_tax_pct || property.original_insurance_monthly || property.original_maintenance_pct_rent || property.original_vacancy_pct_rent || property.original_management_pct_rent || property.original_down_payment_pct || property.original_interest_apr_pct);
                
                let displayValue = metrics.metrics.atROI30y;
                let isOriginalValue = false;
                
                if (hasOriginalValues) {
                  // Recalculate using original values
                  const purchasePrice = Number(property.purchase_price) || 0;
                  const monthlyRent = Number(property.original_monthly_rent) || Number(property.monthly_rent) || 0;
                  const vacancyPctRent = Number(property.original_vacancy_pct_rent) || Number(property.vacancy_pct_rent) || 0;
                  const mgmtPctRent = Number(property.original_management_pct_rent) || Number(property.management_pct_rent) || 0;
                  const maintPctRent = Number(property.original_maintenance_pct_rent) || Number(property.maintenance_pct_rent) || 0;
                  const insuranceMonthly = Number(property.original_insurance_monthly) || Number(property.insurance_monthly) || 0;
                  const hoaMonthly = Number(property.hoa_monthly) || 0;
                  const years = 30;
                  
                  const taxesMonthly = property.original_property_tax_pct 
                    ? (purchasePrice * Number(property.original_property_tax_pct) / 100) / 12
                    : (Number(property.tax_annual) || 0) / 12;
                  
                  const downPayment = purchasePrice * (Number(property.down_payment_pct) / 100);
                  const amountPaid = downPayment + (Number(property.closing_costs) || 0) + (Number(property.repair_costs) || 0);
                  
                  const effectiveMonthlyRent = monthlyRent * (1 - vacancyPctRent / 100);
                  const incomeEarnedFor30y = effectiveMonthlyRent * 12 * years;
                  const totalValue = purchasePrice + incomeEarnedFor30y;
                  
                  // Calculate original mortgage payment
                  let originalMortgagePayment = 0;
                  if (property.original_down_payment_pct && property.original_interest_apr_pct && property.original_loan_years && !property.original_mortgage_free) {
                    const originalDownPct = Number(property.original_down_payment_pct);
                    const originalRate = Number(property.original_interest_apr_pct) / 100;
                    const originalYears = Number(property.original_loan_years);
                    const originalLoanAmount = purchasePrice * (1 - originalDownPct / 100);
                    
                    if (originalLoanAmount > 0 && originalRate > 0) {
                      const monthlyRate = originalRate / 12;
                      const numPayments = originalYears * 12;
                      originalMortgagePayment = originalLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
                    }
                  }
                  
                  let totalExpenses = amountPaid;
                  const totalManagement = monthlyRent * 12 * years * (mgmtPctRent / 100);
                  const mortgagePaymentToUse = originalMortgagePayment > 0 ? originalMortgagePayment : metrics.pAndI;
                  const totalMortgagePayments = mortgagePaymentToUse * 12 * years;
                  const totalPropertyTaxes = taxesMonthly * 12 * years;
                  const totalMaintenanceExpenses = monthlyRent * 12 * years * (maintPctRent / 100);
                  const totalInsurance = insuranceMonthly * 12 * years;
                  const totalHOA = hoaMonthly * 12 * years;
                  
                  totalExpenses += totalManagement + totalMortgagePayments + totalPropertyTaxes + totalMaintenanceExpenses + totalInsurance + totalHOA;
                  
                  // Add income tax
                  const totalClosingCosts = Number(property.closing_costs) || 0;
                  const depreciableBasis = purchasePrice + totalClosingCosts + (insuranceMonthly * 12);
                  const monthlyDepreciation = (depreciableBasis / 27.5) / 12;
                  const monthlyManagement = monthlyRent * (mgmtPctRent / 100);
                  const monthlyMaintenance = monthlyRent * (maintPctRent / 100);
                  const monthlyTaxableIncome = effectiveMonthlyRent - monthlyManagement - monthlyMaintenance - insuranceMonthly - monthlyDepreciation - taxesMonthly;
                  const monthlyIncomeTax = Math.max(0, monthlyTaxableIncome * 0.44);
                  const totalIncomeTax = monthlyIncomeTax * 12 * years;
                  
                  totalExpenses += totalIncomeTax;
                  
                  const netValue = totalValue - totalExpenses;
                  displayValue = amountPaid > 0 ? ((netValue / amountPaid) / years) * 100 : 0;
                  isOriginalValue = true;
                  
                  // Debug logging for Trail Lake
                  if (property.address?.includes('5909 Trail Lake')) {
                    console.log('🎯 PORTFOLIO - Trail Lake 30yATROI Recalculation:', {
                      monthlyRent,
                      originalMortgagePayment: originalMortgagePayment.toFixed(2),
                      totalValue: totalValue.toFixed(2),
                      totalExpenses: totalExpenses.toFixed(2),
                      netValue: netValue.toFixed(2),
                      amountPaid: amountPaid.toFixed(2),
                      finalATROI: displayValue.toFixed(2),
                      hasOriginalValues,
                      usedOriginalMortgage: originalMortgagePayment > 0
                    });
                  }
                }
                
                return (
                  <>
                    <div className={`font-medium ${
                      displayValue >= 10 ? (isOriginalValue ? 'text-blue-600' : 'text-green-600') : 
                      displayValue >= 7 ? (isOriginalValue ? 'text-blue-500' : 'text-yellow-600') : 
                      (isOriginalValue ? 'text-blue-400' : 'text-red-600')
                    }`}>
                      {displayValue.toFixed(2)}% {isOriginalValue ? '📅' : ''}
                    </div>
                    {isOriginalValue && displayValue !== metrics.metrics.atROI30y && (
                      <div className="text-xs text-gray-500">
                        Current: {metrics.metrics.atROI30y.toFixed(2)}%
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            <div>
              <div className="text-gray-600">
                30y TRI:
                <span className="text-xs text-gray-500 ml-1" title="30-Year Total Return on Investment: Comprehensive analysis with inflation, appreciation, and proper tax treatment.">ⓘ</span>
              </div>
              <div className={`font-medium ${
                metrics.metrics.tri30y >= 12 ? 'text-green-600' : 
                metrics.metrics.tri30y >= 8 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {metrics.metrics.tri30y.toFixed(2)}%
              </div>
            </div>
          </div>
          
          {/* Data Source Indicator and Additional Status */}
          <div className="mt-3 pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2">
            <div className={`inline-block px-2 py-1 text-xs rounded ${
              usingCurrentValues 
                ? 'bg-green-100 text-green-700' 
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              Metrics from: {dataSource}
            </div>
            {!isOwned && (
              <div className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">
                Investment Analysis
              </div>
            )}
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
            onClick={onArchive}
            className="px-3 py-1 text-sm rounded border border-orange-300 text-orange-700 hover:bg-orange-50"
          >
            Archive
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