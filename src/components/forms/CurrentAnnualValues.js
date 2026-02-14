import React, { useState } from 'react';

export default function CurrentAnnualValues({ form, updateForm, inputCls, property }) {
  const [taxInputMethod, setTaxInputMethod] = useState('calculated'); // 'calculated' or 'annual'
  const [insuranceInputMode, setInsuranceInputMode] = useState('yearly'); // 'monthly' or 'yearly'
  const [isUpdating, setIsUpdating] = useState(false);
  const [showExpenseReference, setShowExpenseReference] = useState(false);
  const [referenceProperties, setReferenceProperties] = useState([]);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const numericKeys = new Set([
      'monthlyRent', 'currentAppraisalValue', 'currentCountyTaxRate', 'currentCityTaxRate',
      'assessmentPercentage', 'taxAnnual', 'insuranceMonthly', 'insuranceAnnual', 
      'hoaMonthly', 'maintPctRent', 'vacancyPctRent', 'mgmtPctRent', 'otherMonthly',
      'currentMarketValue', 'currentExpensesAnnual', 'currentMortgageBalance', 'currentMortgageRate',
      'currentMortgagePayment', 'currentMortgageTermRemaining'
    ]);
    
    const processedValue = numericKeys.has(key) 
      ? (value === '' ? '' : Number(value)) 
      : value;
    
    updateForm({ [key]: processedValue });
  };

  // Calculate current annual taxes using assessment percentage
  const assessedValue = (form.currentAppraisalValue || 0) * ((form.assessmentPercentage || 25) / 100);
  const countyTaxAmount = assessedValue * ((form.currentCountyTaxRate || 0) / 100);
  const cityTaxAmount = assessedValue * ((form.currentCityTaxRate || 0) / 100);
  const calculatedAnnualTaxes = countyTaxAmount + cityTaxAmount;

  // Determine which tax value to display/use
  const effectiveTaxAnnual = taxInputMethod === 'calculated' ? calculatedAnnualTaxes : (form.taxAnnual || 0);

  // Handle insurance conversion
  const handleInsuranceChange = (e) => {
    if (isUpdating) return; // Prevent recursive updates
    
    setIsUpdating(true);
    const value = Number(e.target.value) || 0;
    
    if (insuranceInputMode === 'yearly') {
      updateForm({ 
        insuranceAnnual: value,
        insuranceMonthly: value / 12 
      });
    } else {
      updateForm({ 
        insuranceMonthly: value,
        insuranceAnnual: value * 12 
      });
    }
    
    // Reset the flag after a brief delay
    setTimeout(() => setIsUpdating(false), 100);
  };

  const displayInsuranceValue = insuranceInputMode === 'yearly' 
    ? (form.insuranceAnnual || 0)
    : (form.insuranceMonthly || 0);

  const openZillowPage = () => {
    if (!property.zillow_zpid) {
      alert('No Zillow ZPID found for this property. Please add a ZPID in the property details first.');
      return;
    }

    // Open Zillow page for this property
    const zillowUrl = `https://www.zillow.com/homedetails/${property.zillow_zpid}_zpid/`;
    window.open(zillowUrl, '_blank');
  };

  const loadReferenceProperties = async () => {
    try {
      const { default: apiClient } = await import('@/lib/apiClient');
      const properties = await apiClient.getProperties();
      // Filter out the current property being edited
      const filteredProperties = properties.filter(p => p.id !== property.id);
      setReferenceProperties(filteredProperties);
      setShowExpenseReference(true);
    } catch (error) {
      console.error('Failed to load reference properties:', error);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Current Property Values</h2>
          <p className="text-sm text-gray-600">Current rent, taxes, insurance, market value, and all operating expenses</p>
        </div>
        <button
          type="button"
          onClick={loadReferenceProperties}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
        >
          📊 Reference Values
        </button>
      </div>
      
      <div className="space-y-6">
        {/* Monthly Rent */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Monthly Rent ($)
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

        {/* Property Taxes Section */}
        <div className="space-y-4">
          <h3 className="text-md font-medium text-gray-800">Property Taxes</h3>
          
          {/* Tax Input Method Toggle */}
          <div className="flex items-center gap-4 mb-3">
            <label className="flex items-center">
              <input 
                type="radio" 
                name="taxInputMethod"
                value="calculated" 
                checked={taxInputMethod === 'calculated'}
                onChange={(e) => setTaxInputMethod(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm text-gray-600">Calculate from rates</span>
            </label>
            <label className="flex items-center">
              <input 
                type="radio" 
                name="taxInputMethod"
                value="annual" 
                checked={taxInputMethod === 'annual'}
                onChange={(e) => setTaxInputMethod(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm text-gray-600">Enter annual amount</span>
            </label>
          </div>

          {/* Always show all fields, gray out inactive ones */}
          {/* Calculated Method Fields */}
          <div className={taxInputMethod === 'calculated' ? '' : 'opacity-50 pointer-events-none'}>
            <div className="grid md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Appraisal Value ($)</label>
                <input 
                  type="number"
                  step="1000"
                  className={inputCls}
                  value={form.currentAppraisalValue || ''}
                  onChange={set('currentAppraisalValue')}
                  placeholder="Property appraisal value"
                  disabled={taxInputMethod !== 'calculated'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">County Tax Rate (%)</label>
                <input 
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={form.currentCountyTaxRate || ''}
                  onChange={set('currentCountyTaxRate')}
                  placeholder="0.85"
                  disabled={taxInputMethod !== 'calculated'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City Tax Rate (%)</label>
                <input 
                  type="number"
                  step="0.01"
                  className={inputCls}
                  value={form.currentCityTaxRate || ''}
                  onChange={set('currentCityTaxRate')}
                  placeholder="0.35"
                  disabled={taxInputMethod !== 'calculated'}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Assessment %</label>
                <input 
                  type="number"
                  step="0.5"
                  min="0"
                  max="100"
                  className={inputCls}
                  value={form.assessmentPercentage || 25}
                  onChange={set('assessmentPercentage')}
                  placeholder="25"
                  disabled={taxInputMethod !== 'calculated'}
                />
              </div>
            </div>
            
            <div className="mt-3 p-3 bg-gray-50 rounded">
              <div className="text-sm text-gray-600">
                <div className="mb-2">
                  <strong>Assessed Value: ${assessedValue.toLocaleString()}</strong>
                  <span className="text-gray-600"> ({form.assessmentPercentage || 25}% of ${(form.currentAppraisalValue || 0).toLocaleString()})</span>
                </div>
                <div className="space-y-1">
                  <div>County Tax: ${countyTaxAmount.toLocaleString()} (${assessedValue.toLocaleString()} × {form.currentCountyTaxRate || 0}%)</div>
                  <div>City Tax: ${cityTaxAmount.toLocaleString()} (${assessedValue.toLocaleString()} × {form.currentCityTaxRate || 0}%)</div>
                  <div className="pt-1 border-t border-gray-300">
                    <strong>Total Annual Taxes: ${calculatedAnnualTaxes.toLocaleString()}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Annual Amount Method Field */}
          <div className={taxInputMethod === 'annual' ? '' : 'opacity-50 pointer-events-none'}>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Annual Property Taxes ($)</label>
              <input 
                type="number" 
                step="100"
                className={inputCls} 
                value={form.taxAnnual || ''}
                onChange={set('taxAnnual')}
                placeholder="6000"
                disabled={taxInputMethod !== 'annual'}
              />
              <div className="text-xs text-gray-500 mt-1">
                Enter the total annual property tax amount directly
              </div>
            </div>
          </div>
        </div>

        {/* Insurance Section */}
        <div className="space-y-3">
          <h3 className="text-md font-medium text-gray-800">Insurance</h3>
          
          {/* Insurance Input Mode Toggle */}
          <div className="flex items-center gap-4 mb-2">
            <label className="flex items-center">
              <input 
                type="radio" 
                name="insuranceInputMode"
                value="yearly" 
                checked={insuranceInputMode === 'yearly'}
                onChange={(e) => setInsuranceInputMode(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm text-gray-600">Yearly</span>
            </label>
            <label className="flex items-center">
              <input 
                type="radio" 
                name="insuranceInputMode"
                value="monthly" 
                checked={insuranceInputMode === 'monthly'}
                onChange={(e) => setInsuranceInputMode(e.target.value)}
                className="mr-2"
              />
              <span className="text-sm text-gray-600">Monthly</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Insurance ({insuranceInputMode === 'yearly' ? '$/year' : '$/month'})
            </label>
            <input 
              type="number" 
              step={insuranceInputMode === 'yearly' ? "100" : "10"}
              className={inputCls} 
              value={displayInsuranceValue}
              onChange={handleInsuranceChange}
              placeholder={insuranceInputMode === 'yearly' ? "1440" : "120"}
            />
            <div className="text-xs text-gray-500 mt-1">
              {insuranceInputMode === 'yearly' 
                ? `Monthly: $${Math.round(displayInsuranceValue / 12)}` 
                : `Yearly: $${Math.round(displayInsuranceValue * 12)}`
              }
            </div>
          </div>
        </div>

        {/* Other Expenses */}
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

        {/* Percentage-based Expenses */}
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
              placeholder="9"
            />
          </div>
        </div>

        {/* Current Market Value */}
        <div className="space-y-3">
          <h3 className="text-md font-medium text-gray-800">Current Market Value</h3>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Market Value ($)</label>
              <input 
                type="number"
                step="1000"
                className={inputCls}
                value={form.currentMarketValue || ''}
                onChange={set('currentMarketValue')}
                placeholder="Current estimated market value"
              />
            </div>
            
            <div className="flex flex-col justify-end">
              <button
                type="button"
                onClick={openZillowPage}
                disabled={!property.zillow_zpid}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Open Zillow Page
              </button>
              <div className="text-xs text-gray-600 mt-1">
                {property.zillow_zpid ? `ZPID: ${property.zillow_zpid}` : 'No ZPID set'}
              </div>
            </div>
          </div>
        </div>

        {/* Additional Current Expenses */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Expenses ($/year)</label>
          <input 
            type="number"
            step="100"
            className={inputCls}
            value={form.currentExpensesAnnual || ''}
            onChange={set('currentExpensesAnnual')}
            placeholder="Annual maintenance, repairs, vacancy, etc."
          />
          <div className="text-xs text-gray-600 mt-1">
            Override calculated expenses with actual annual amounts if known
          </div>
        </div>

        {/* Current Mortgage (if not mortgage-free) */}
        {!form.mortgageFree && (
          <div className="space-y-3">
            <h3 className="text-md font-medium text-gray-800">Current Mortgage</h3>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Balance ($)</label>
                <input 
                  type="number"
                  step="1000"
                  className={inputCls}
                  value={form.currentMortgageBalance || ''}
                  onChange={set('currentMortgageBalance')}
                  placeholder="Outstanding mortgage balance"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Rate (%)</label>
                <input 
                  type="number"
                  step="0.125"
                  className={inputCls}
                  value={form.currentMortgageRate || ''}
                  onChange={set('currentMortgageRate')}
                  placeholder="Current interest rate"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Payment ($/month)</label>
                <input 
                  type="number"
                  step="10"
                  className={inputCls}
                  value={form.currentMortgagePayment || ''}
                  onChange={set('currentMortgagePayment')}
                  placeholder="Monthly P&I payment"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Years Remaining</label>
                <input 
                  type="number"
                  step="1"
                  className={inputCls}
                  value={form.currentMortgageTermRemaining || ''}
                  onChange={set('currentMortgageTermRemaining')}
                  placeholder="Years left on loan"
                />
              </div>
            </div>
          </div>
        )}

        {/* Hidden field to store the effective tax annual for calculations */}
        <input 
          type="hidden" 
          value={effectiveTaxAnnual}
          onChange={() => {}} // Read-only calculated value
        />
      </div>
      
      {/* Expense Reference Modal */}
      {showExpenseReference && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-90vh overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold text-gray-600">Expense Reference Values</h2>
              <button
                onClick={() => setShowExpenseReference(false)}
                className="text-gray-400 hover:text-gray-600 text-xl"
              >
                ✕
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-3 font-medium text-gray-900">Property</th>
                    <th className="text-right p-3 font-medium text-gray-900">Rent/mo</th>
                    <th className="text-right p-3 font-medium text-gray-900">Insurance/year</th>
                    <th className="text-right p-3 font-medium text-gray-900">Tax Annual</th>
                    <th className="text-right p-3 font-medium text-gray-900">HOA/mo</th>
                    <th className="text-right p-3 font-medium text-gray-900">Other/mo</th>
                    <th className="text-right p-3 font-medium text-gray-900">Maintenance %<sup>1</sup></th>
                    <th className="text-right p-3 font-medium text-gray-900">Vacancy %<sup>1</sup></th>
                    <th className="text-right p-3 font-medium text-gray-900">Management %<sup>1</sup></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {referenceProperties.map((property) => (
                    <tr key={property.id} className="hover:bg-gray-50 text-gray-900">
                      <td className="p-3">
                        <div className="font-medium text-gray-600">{property.address}</div>
                        <div className="text-xs text-gray-600">{property.city}, {property.state}</div>
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${Math.round(property.original_monthly_rent || property.current_rent_monthly || property.monthly_rent || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${Math.round((property.original_insurance_monthly * 12) || property.current_insurance_annual || (property.insurance_monthly * 12) || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${(() => {
                          // Check for tax_annual first, then calculate from rates if available
                          const taxAnnual = Number(property.tax_annual) || 0;
                          if (taxAnnual > 0) return Math.round(taxAnnual).toLocaleString();
                          
                          // Calculate from rates if available
                          const appraisal = Number(property.current_appraisal_value || property.purchase_price) || 0;
                          const assessment = Number(property.assessment_percentage) || 25;
                          const countyRate = Number(property.current_county_tax_rate) || 0;
                          const cityRate = Number(property.current_city_tax_rate) || 0;
                          
                          if (appraisal > 0 && (countyRate > 0 || cityRate > 0)) {
                            const assessedValue = appraisal * (assessment / 100);
                            const calculatedTax = assessedValue * ((countyRate + cityRate) / 100);
                            if (!isNaN(calculatedTax) && calculatedTax > 0) {
                              return Math.round(calculatedTax).toLocaleString();
                            }
                          }
                          
                          // Fallback: check if property has original or current tax percentage data
                          const taxPct = Number(property.original_property_tax_pct || property.property_tax_pct) || 0;
                          if (taxPct > 0 && appraisal > 0) {
                            const fallbackTax = appraisal * (taxPct / 100);
                            if (!isNaN(fallbackTax) && fallbackTax > 0) {
                              return Math.round(fallbackTax).toLocaleString();
                            }
                          }
                          
                          return '0';
                        })()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${Math.round(property.current_hoa_monthly || property.hoa_monthly || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${Math.round(property.other_monthly_expenses || property.other_monthly || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        {(() => {
                          const baseMaint = Number(property.original_maintenance_pct_rent || property.maintenance_pct_rent) || 0;
                          const otherMonthly = Number(property.other_monthly_expenses || property.other_monthly) || 0;
                          const rent = Number(property.original_monthly_rent || property.current_rent_monthly || property.monthly_rent) || 0;
                          
                          // If there's "other" expenses and rent, convert other to percentage and add to maintenance
                          if (otherMonthly > 0 && rent > 0) {
                            const otherPct = (otherMonthly / rent) * 100;
                            const totalMaintPct = baseMaint + otherPct;
                            return (Math.round(totalMaintPct * 10) / 10); // Round to 1 decimal, return just the number
                          }
                          
                          return baseMaint;
                        })()}%
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        {property.original_vacancy_pct_rent || property.vacancy_pct_rent || 0}%
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        {property.original_management_pct_rent || property.management_pct_rent || 0}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {referenceProperties.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                <p>No properties found for reference.</p>
              </div>
            )}
            
            <div className="mt-6 space-y-3">
              <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-3">
                💡 <strong>Tip:</strong> Use these values as reference when entering current property values. 
                Similar properties in the same area often have comparable expenses.
              </div>
              
              <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-2">
                <strong>Footnotes:</strong><br/>
                <sup>1</sup> Percentages are calculated as percentage of monthly rental income
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}