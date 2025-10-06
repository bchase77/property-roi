import React, { useState } from 'react';

export default function CurrentValuesEditor({ property, onUpdate, onCancel }) {
  const [form, setForm] = useState({
    // Current operating values
    currentRentMonthly: property.current_rent_monthly || property.monthly_rent || 0,
    currentInsuranceAnnual: property.current_insurance_annual || (property.insurance_monthly * 12) || 0,
    currentCountyTaxRate: property.current_county_tax_rate || 0,
    currentCityTaxRate: property.current_city_tax_rate || 0,
    currentAppraisalValue: property.current_appraisal_value || property.purchase_price || 0,
    currentExpensesAnnual: property.current_expenses_annual || 0,
    currentManagementPct: property.current_management_pct || property.management_pct_rent || 0,
    currentHoaMonthly: property.current_hoa_monthly || property.hoa_monthly || 0,
    currentMarketValue: property.current_market_value || property.purchase_price || 0,
    assessmentPercentage: property.assessment_percentage || 25,
    
    // Current mortgage values (if applicable)
    currentMortgageBalance: property.current_mortgage_balance || 0,
    currentMortgageRate: property.current_mortgage_rate || property.interest_apr_pct || 0,
    currentMortgagePayment: property.current_mortgage_payment || 0,
    currentMortgageTermRemaining: property.current_mortgage_term_remaining || 0
  });

  const [saving, setSaving] = useState(false);
  const [fetchingZillow, setFetchingZillow] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Only update current values fields - preserve all other property data
      const updateData = {
        // Preserve all existing basic property fields
        address: property.address,
        city: property.city,
        state: property.state,
        zip: property.zip,
        purchasePrice: property.purchase_price,
        downPct: property.down_payment_pct,
        rateApr: property.interest_apr_pct,
        years: property.loan_years,
        monthlyRent: property.monthly_rent,
        taxPct: property.property_tax_pct,
        hoaMonthly: property.hoa_monthly,
        insuranceMonthly: property.insurance_monthly,
        maintPctRent: property.maintenance_pct_rent,
        vacancyPctRent: property.vacancy_pct_rent,
        mgmtPctRent: property.management_pct_rent,
        otherMonthly: property.other_monthly,
        initialInvestment: property.initial_investment,
        mortgageFree: property.mortgage_free,
        purchased: property.purchased,
        yearPurchased: property.year_purchased,
        monthPurchased: property.month_purchased,
        zillowZpid: property.zillow_zpid, // Preserve ZPID
        // Preserve property characteristics
        bedrooms: property.bedrooms,
        bathrooms: property.bathrooms,
        squareFootage: property.square_footage,
        yearBuilt: property.year_built,
        
        // Only update current values
        currentRentMonthly: form.currentRentMonthly,
        currentInsuranceAnnual: form.currentInsuranceAnnual,
        currentCountyTaxRate: form.currentCountyTaxRate,
        currentCityTaxRate: form.currentCityTaxRate,
        currentAppraisalValue: form.currentAppraisalValue,
        currentExpensesAnnual: form.currentExpensesAnnual,
        currentManagementPct: form.currentManagementPct,
        currentHoaMonthly: form.currentHoaMonthly,
        currentMarketValue: form.currentMarketValue,
        assessmentPercentage: form.assessmentPercentage,
        currentMortgageBalance: form.currentMortgageBalance,
        currentMortgageRate: form.currentMortgageRate,
        currentMortgagePayment: form.currentMortgagePayment,
        currentMortgageTermRemaining: form.currentMortgageTermRemaining
      };
      
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      
      if (!res.ok) {
        throw new Error('Failed to update current values');
      }
      
      onUpdate(await res.json());
    } catch (error) {
      console.error('Failed to update current values:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const numericValue = e.target.type === 'number' ? (value === '' ? '' : Number(value)) : value;
    setForm(prev => ({ ...prev, [field]: numericValue }));
  };

  const fetchZillowValue = async () => {
    if (!property.zillow_zpid) {
      alert('No Zillow ZPID found for this property. Please add a ZPID in the property details first.');
      return;
    }

    setFetchingZillow(true);
    try {
      const response = await fetch(`/api/properties/${property.id}/zillow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zpid: property.zillow_zpid })
      });

      const data = await response.json();
      
      if (response.ok && data.success) {
        setForm(prev => ({ 
          ...prev, 
          currentMarketValue: data.marketValue 
        }));
        alert(`Market value updated: $${data.marketValue.toLocaleString()}\nSource: ${data.source}\nLast updated: ${new Date(data.updatedAt).toLocaleDateString()}`);
      } else {
        alert(`Failed to fetch Zillow data: ${data.error}`);
      }
    } catch (error) {
      console.error('Error fetching Zillow data:', error);
      alert('Failed to fetch Zillow data. Please try again later.');
    } finally {
      setFetchingZillow(false);
    }
  };

  const inputCls = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  // Calculate current annual taxes using assessment percentage
  const assessedValue = form.currentAppraisalValue * (form.assessmentPercentage / 100);
  const currentAnnualTaxes = (
    (assessedValue * (form.currentCountyTaxRate / 100)) +
    (assessedValue * (form.currentCityTaxRate / 100))
  );

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-700">Current Property Values</h3>
      <p className="text-sm text-gray-600 mb-4">
        Update current values for accurate performance comparison. Historical data is tracked separately.
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Current Income & Expenses */}
        <div>
          <h4 className="text-md font-medium text-gray-800 mb-3">Current Income & Operating Expenses</h4>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Rent ($/month)</label>
              <input 
                type="number"
                step="50"
                className={inputCls}
                value={form.currentRentMonthly}
                onChange={handleChange('currentRentMonthly')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Insurance ($/year)</label>
              <input 
                type="number"
                step="100"
                className={inputCls}
                value={form.currentInsuranceAnnual}
                onChange={handleChange('currentInsuranceAnnual')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Expenses ($/year)</label>
              <input 
                type="number"
                step="100"
                className={inputCls}
                value={form.currentExpensesAnnual}
                onChange={handleChange('currentExpensesAnnual')}
              />
              <div className="text-xs text-gray-600 mt-1">
                Maintenance, repairs, vacancy allowance, etc.
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Management (%)</label>
              <input 
                type="number"
                step="0.5"
                className={inputCls}
                value={form.currentManagementPct}
                onChange={handleChange('currentManagementPct')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current HOA ($/month)</label>
              <input 
                type="number"
                step="10"
                className={inputCls}
                value={form.currentHoaMonthly}
                onChange={handleChange('currentHoaMonthly')}
              />
            </div>
          </div>
        </div>

        {/* Current Market Value */}
        <div>
          <h4 className="text-md font-medium text-gray-800 mb-3">Current Market Value</h4>
          
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Market Value ($)</label>
              <input 
                type="number"
                step="1000"
                className={inputCls}
                value={form.currentMarketValue}
                onChange={handleChange('currentMarketValue')}
              />
              <div className="text-xs text-gray-600 mt-1">
                Current estimated market value
              </div>
            </div>
            
            <div className="flex flex-col justify-end">
              <button
                type="button"
                onClick={fetchZillowValue}
                disabled={fetchingZillow || !property.zillow_zpid}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fetchingZillow ? 'Fetching...' : 'Get Zillow Value'}
              </button>
              <div className="text-xs text-gray-600 mt-1">
                {property.zillow_zpid ? `ZPID: ${property.zillow_zpid}` : 'No ZPID set'}
              </div>
            </div>
          </div>
        </div>

        {/* Current Property Taxes */}
        <div>
          <h4 className="text-md font-medium text-gray-800 mb-3">Current Property Taxes</h4>
          
          <div className="grid md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Appraisal Value ($)</label>
              <input 
                type="number"
                step="1000"
                className={inputCls}
                value={form.currentAppraisalValue}
                onChange={handleChange('currentAppraisalValue')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">County Tax Rate (%)</label>
              <input 
                type="number"
                step="0.01"
                className={inputCls}
                value={form.currentCountyTaxRate}
                onChange={handleChange('currentCountyTaxRate')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City Tax Rate (%)</label>
              <input 
                type="number"
                step="0.01"
                className={inputCls}
                value={form.currentCityTaxRate}
                onChange={handleChange('currentCityTaxRate')}
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
                value={form.assessmentPercentage}
                onChange={handleChange('assessmentPercentage')}
                placeholder="25"
              />
              <div className="text-xs text-gray-600 mt-1">
                Percentage of appraisal value used for tax calculation
              </div>
            </div>
          </div>
          
          <div className="mt-2 p-3 bg-gray-50 rounded">
            <div className="text-sm text-gray-600">
              <div className="mb-2">
                <strong>Assessed Value: ${assessedValue.toLocaleString()}</strong>
                <span className="text-gray-600"> ({form.assessmentPercentage}% of ${form.currentAppraisalValue.toLocaleString()})</span>
              </div>
              <div>
                <strong>Estimated Annual Taxes: ${currentAnnualTaxes.toLocaleString()}</strong>
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Assessed value × (County {form.currentCountyTaxRate}% + City {form.currentCityTaxRate}%)
              </div>
            </div>
          </div>
        </div>

        {/* Current Mortgage (if not mortgage-free) */}
        {!property.mortgage_free && (
          <div>
            <h4 className="text-md font-medium text-gray-800 mb-3">Current Mortgage</h4>
            
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Balance ($)</label>
                <input 
                  type="number"
                  step="1000"
                  className={inputCls}
                  value={form.currentMortgageBalance}
                  onChange={handleChange('currentMortgageBalance')}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Rate (%)</label>
                <input 
                  type="number"
                  step="0.125"
                  className={inputCls}
                  value={form.currentMortgageRate}
                  onChange={handleChange('currentMortgageRate')}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current Payment ($/month)</label>
                <input 
                  type="number"
                  step="10"
                  className={inputCls}
                  value={form.currentMortgagePayment}
                  onChange={handleChange('currentMortgagePayment')}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Years Remaining</label>
                <input 
                  type="number"
                  step="1"
                  className={inputCls}
                  value={form.currentMortgageTermRemaining}
                  onChange={handleChange('currentMortgageTermRemaining')}
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex space-x-3 pt-4 border-t">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Update Current Values'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}