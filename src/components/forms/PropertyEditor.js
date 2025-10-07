import React, { useState } from 'react';

export default function PropertyEditor({ property, onUpdate, onCancel }) {
  const [form, setForm] = useState({
    address: property.address || '',
    city: property.city || '',
    state: property.state || '',
    zip: property.zip || '',
    purchasePrice: property.purchase_price || 0,
    downPct: property.down_payment_pct || 20,
    rateApr: property.interest_apr_pct || 6.5,
    years: property.loan_years || 30,
    monthlyRent: property.monthly_rent || 0,
    taxPct: property.property_tax_pct || 1.2,
    taxAnnual: property.tax_annual || 0,
    taxInputMode: property.tax_input_mode || 'percentage',
    hoaMonthly: property.hoa_monthly || 0,
    insuranceMonthly: property.insurance_monthly || 120,
    maintPctRent: property.maintenance_pct_rent || 5,
    vacancyPctRent: property.vacancy_pct_rent || 5,
    mgmtPctRent: property.management_pct_rent || 8,
    otherMonthly: property.other_monthly || 0,
    initialInvestment: property.initial_investment || 0,
    mortgageFree: property.mortgage_free || false,
    purchased: property.purchased || false,
    yearPurchased: property.year_purchased || '',
    monthPurchased: property.month_purchased || '',
    zillowZpid: property.zillow_zpid || '',
    bedrooms: property.bedrooms || '',
    bathrooms: property.bathrooms || '',
    squareFootage: property.square_footage || '',
    yearBuilt: property.year_built || '',
    abbreviation: property.abbreviation || ''
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Preserve all current values when updating basic property details
      const updateData = {
        ...form,
        // Preserve current values
        currentRentMonthly: property.current_rent_monthly,
        currentInsuranceAnnual: property.current_insurance_annual,
        currentCountyTaxRate: property.current_county_tax_rate,
        currentCityTaxRate: property.current_city_tax_rate,
        currentAppraisalValue: property.current_appraisal_value,
        currentExpensesAnnual: property.current_expenses_annual,
        currentManagementPct: property.current_management_pct,
        currentHoaMonthly: property.current_hoa_monthly,
        currentMarketValue: property.current_market_value,
        marketValueUpdatedAt: property.market_value_updated_at,
        assessmentPercentage: property.assessment_percentage,
        currentMortgageBalance: property.current_mortgage_balance,
        currentMortgageRate: property.current_mortgage_rate,
        currentMortgagePayment: property.current_mortgage_payment,
        currentMortgageTermRemaining: property.current_mortgage_term_remaining,
        // Include new tax fields
        taxAnnual: form.taxAnnual,
        taxInputMode: form.taxInputMode
      };
      
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      
      if (!res.ok) {
        throw new Error('Failed to update property');
      }
      
      onUpdate(await res.json());
    } catch (error) {
      console.error('Failed to update property:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const inputCls = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-600">Edit Property Details</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input 
            className={inputCls}
            value={form.address}
            onChange={handleChange('address')}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Chart Abbreviation</label>
          <input 
            className={inputCls}
            value={form.abbreviation}
            onChange={handleChange('abbreviation')}
            placeholder="e.g., TLK, Hunt, Kings"
            maxLength="10"
          />
          <div className="text-xs text-gray-500 mt-1">
            Short name for charts (optional). If empty, house number will be used.
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <input 
            placeholder="City"
            className={inputCls}
            value={form.city}
            onChange={handleChange('city')}
          />
          <input 
            placeholder="State"
            className={inputCls}
            value={form.state}
            onChange={handleChange('state')}
          />
          <input 
            placeholder="ZIP"
            className={inputCls}
            value={form.zip}
            onChange={handleChange('zip')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price ($)</label>
          <input 
            type="number"
            className={inputCls}
            value={form.purchasePrice}
            onChange={handleChange('purchasePrice')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent ($)</label>
          <input 
            type="number"
            className={inputCls}
            value={form.monthlyRent}
            onChange={handleChange('monthlyRent')}
          />
        </div>

        {/* Mortgage Details */}
        {!form.mortgageFree && (
          <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-md font-medium text-gray-700">Mortgage Details</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Down Payment (%)</label>
                <input 
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={form.downPct}
                  onChange={handleChange('downPct')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interest Rate (%)</label>
                <input 
                  type="number"
                  step="0.1"
                  className={inputCls}
                  value={form.rateApr}
                  onChange={handleChange('rateApr')}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Loan Term (years)</label>
              <input 
                type="number"
                className={inputCls}
                value={form.years}
                onChange={handleChange('years')}
              />
            </div>
          </div>
        )}

        {/* Operating Expenses */}
        <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-md font-medium text-gray-700">Operating Expenses</h4>
          
          {/* Property Tax Input Mode Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Property Tax</label>
            <div className="flex items-center gap-4 mb-2">
              <label className="flex items-center">
                <input 
                  type="radio" 
                  name="taxInputMode"
                  value="percentage" 
                  checked={form.taxInputMode === 'percentage'}
                  onChange={handleChange('taxInputMode')}
                  className="mr-2"
                />
                <span className="text-sm">Percentage</span>
              </label>
              <label className="flex items-center">
                <input 
                  type="radio" 
                  name="taxInputMode"
                  value="annual" 
                  checked={form.taxInputMode === 'annual'}
                  onChange={handleChange('taxInputMode')}
                  className="mr-2"
                />
                <span className="text-sm">Annual Amount</span>
              </label>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                {form.taxInputMode === 'percentage' ? (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Tax Rate (%)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      className={inputCls} 
                      value={form.taxPct} 
                      onChange={handleChange('taxPct')}
                      placeholder="1.2"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Annual Tax ($)</label>
                    <input 
                      type="number" 
                      step="100"
                      className={inputCls} 
                      value={form.taxAnnual} 
                      onChange={handleChange('taxAnnual')}
                      placeholder="6000"
                    />
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Insurance ($/mo)</label>
                <input 
                  type="number"
                  className={inputCls}
                  value={form.insuranceMonthly}
                  onChange={handleChange('insuranceMonthly')}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">HOA ($/mo)</label>
              <input 
                type="number"
                className={inputCls}
                value={form.hoaMonthly}
                onChange={handleChange('hoaMonthly')}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Other ($/mo)</label>
              <input 
                type="number"
                className={inputCls}
                value={form.otherMonthly}
                onChange={handleChange('otherMonthly')}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Maintenance (% rent)</label>
              <input 
                type="number"
                step="0.5"
                className={inputCls}
                value={form.maintPctRent}
                onChange={handleChange('maintPctRent')}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Vacancy (% rent)</label>
              <input 
                type="number"
                step="0.5"
                className={inputCls}
                value={form.vacancyPctRent}
                onChange={handleChange('vacancyPctRent')}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Management (% rent)</label>
              <input 
                type="number"
                step="0.5"
                className={inputCls}
                value={form.mgmtPctRent}
                onChange={handleChange('mgmtPctRent')}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Initial Investment ($)</label>
          <input 
            type="number"
            className={inputCls}
            value={form.initialInvestment}
            onChange={handleChange('initialInvestment')}
          />
          <div className="text-xs text-gray-500 mt-1">
            Down payment + closing costs + initial repairs
          </div>
        </div>

        {/* Property Characteristics */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
            <input 
              type="number"
              min="0"
              className={inputCls}
              value={form.bedrooms}
              onChange={handleChange('bedrooms')}
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
              value={form.bathrooms}
              onChange={handleChange('bathrooms')}
              placeholder="2.5"
            />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Square Footage</label>
            <input 
              type="number"
              min="0"
              className={inputCls}
              value={form.squareFootage}
              onChange={handleChange('squareFootage')}
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
              value={form.yearBuilt}
              onChange={handleChange('yearBuilt')}
              placeholder="1995"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Zillow ZPID</label>
          <input 
            type="text"
            className={inputCls}
            value={form.zillowZpid}
            onChange={handleChange('zillowZpid')}
            placeholder="123456789"
          />
          <div className="text-xs text-gray-500 mt-1">
            8-10 digit ID from Zillow URL (e.g., zillow.com/homedetails/123456789_zpid/)
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox"
              id="purchased"
              checked={form.purchased}
              onChange={handleChange('purchased')}
              className="rounded"
            />
            <label htmlFor="purchased" className="text-sm font-medium text-gray-700">
              Already Purchased
            </label>
          </div>

          {form.purchased && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Year Purchased</label>
                <input 
                  type="number"
                  min="1900"
                  max="2030"
                  className="w-full rounded-md border text-gray-600 border-gray-300 px-3 py-2"
                  value={form.yearPurchased}
                  onChange={handleChange('yearPurchased')}
                  placeholder="2023"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Month Purchased</label>
                <select 
                  className="w-full rounded-md border text-gray-600 border-gray-300 px-3 py-2"
                  value={form.monthPurchased}
                  onChange={handleChange('monthPurchased')}
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
          )}

          <div className="flex items-center space-x-2">
            <input 
              type="checkbox"
              id="mortgageFree"
              checked={form.mortgageFree}
              onChange={handleChange('mortgageFree')}
              className="rounded"
            />
            <label htmlFor="mortgageFree" className="text-sm font-medium text-gray-700">
              Mortgage-Free
            </label>
          </div>
        </div>

        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Update Property'}
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