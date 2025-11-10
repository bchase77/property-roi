import React, { useState } from 'react';

export default function CurrentAnnualValues({ form, updateForm, inputCls, property }) {
  const [taxInputMethod, setTaxInputMethod] = useState('calculated'); // 'calculated' or 'annual'
  const [insuranceInputMode, setInsuranceInputMode] = useState('yearly'); // 'monthly' or 'yearly'
  const [isUpdating, setIsUpdating] = useState(false);

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

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Current Property Values</h2>
      <p className="text-sm text-gray-600 mb-4">Current rent, taxes, insurance, market value, and all operating expenses</p>
      
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

          {taxInputMethod === 'calculated' ? (
            <>
              {/* Calculated Method */}
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
            </>
          ) : (
            <>
              {/* Annual Amount Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual Property Taxes ($)</label>
                <input 
                  type="number" 
                  step="100"
                  className={inputCls} 
                  value={form.taxAnnual || ''}
                  onChange={set('taxAnnual')}
                  placeholder="6000"
                />
              </div>
            </>
          )}
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
    </div>
  );
}