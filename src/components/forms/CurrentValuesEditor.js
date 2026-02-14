import React, { useState } from 'react';

export default function CurrentValuesEditor({ property, onUpdate, onCancel }) {
  const [showExpenseReference, setShowExpenseReference] = useState(false);
  const [referenceProperties, setReferenceProperties] = useState([]);
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
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-700">Current Property Values</h3>
        <button
          type="button"
          onClick={loadReferenceProperties}
          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-1"
        >
          📊 Reference Values
        </button>
      </div>
      <p className="text-sm text-gray-600 mb-4">
        Update current values for accurate performance comparison. Historical data is tracked separately.
      </p>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Rent and Income */}
        <div className="grid md:grid-cols-3 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Rent</h4>
            <label className="block text-xs font-medium text-gray-700 mb-1">Current Rent ($/month)</label>
            <input 
              type="number"
              step="50"
              className={inputCls}
              value={form.currentRentMonthly}
              onChange={handleChange('currentRentMonthly')}
            />
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Insurance</h4>
            <label className="block text-xs font-medium text-gray-700 mb-1">Current Insurance ($/year)</label>
            <input 
              type="number"
              step="100"
              className={inputCls}
              value={form.currentInsuranceAnnual}
              onChange={handleChange('currentInsuranceAnnual')}
            />
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">HOA</h4>
            <label className="block text-xs font-medium text-gray-700 mb-1">Current HOA ($/month)</label>
            <input 
              type="number"
              step="10"
              className={inputCls}
              value={form.currentHoaMonthly}
              onChange={handleChange('currentHoaMonthly')}
            />
          </div>
        </div>

        {/* Operating Expenses and Management */}
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Other Expenses</h4>
            <label className="block text-xs font-medium text-gray-700 mb-1">Current Annual Expenses ($)</label>
            <input 
              type="number"
              step="100"
              className={inputCls}
              value={form.currentExpensesAnnual}
              onChange={handleChange('currentExpensesAnnual')}
            />
            <div className="text-xs text-gray-600 mt-1">
              Maintenance, repairs, vacancy, etc.
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Management</h4>
            <label className="block text-xs font-medium text-gray-700 mb-1">Current Management (%)</label>
            <input 
              type="number"
              step="0.5"
              className={inputCls}
              value={form.currentManagementPct}
              onChange={handleChange('currentManagementPct')}
            />
          </div>
        </div>

        {/* Property Taxes */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 mb-2">Taxes</h4>
          <div className="grid md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Appraisal Value ($)</label>
              <input 
                type="number"
                step="1000"
                className={inputCls}
                value={form.currentAppraisalValue}
                onChange={handleChange('currentAppraisalValue')}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">County Rate (%)</label>
              <input 
                type="number"
                step="0.01"
                className={inputCls}
                value={form.currentCountyTaxRate}
                onChange={handleChange('currentCountyTaxRate')}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">City Rate (%)</label>
              <input 
                type="number"
                step="0.01"
                className={inputCls}
                value={form.currentCityTaxRate}
                onChange={handleChange('currentCityTaxRate')}
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assessment %</label>
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
            </div>
          </div>
          
          <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
            <div>
              <strong>Assessed: ${assessedValue.toLocaleString()}</strong> ({form.assessmentPercentage}% of ${form.currentAppraisalValue.toLocaleString()})
            </div>
            <div>
              <strong>Annual Taxes: ${currentAnnualTaxes.toLocaleString()}</strong>
            </div>
          </div>
        </div>

        {/* Market Value */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 mb-2">Market Value</h4>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Current Market Value ($)</label>
              <input 
                type="number"
                step="1000"
                className={inputCls}
                value={form.currentMarketValue}
                onChange={handleChange('currentMarketValue')}
              />
            </div>
            
            <div className="flex flex-col justify-end">
              <button
                type="button"
                onClick={fetchZillowValue}
                disabled={fetchingZillow || !property.zillow_zpid}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {fetchingZillow ? 'Fetching...' : 'Get Zillow Value'}
              </button>
              <div className="text-xs text-gray-600 mt-1">
                {property.zillow_zpid ? `ZPID: ${property.zillow_zpid}` : 'No ZPID set'}
              </div>
            </div>
          </div>
        </div>

        {/* Current Mortgage (if not mortgage-free) */}
        {!property.mortgage_free && (
          <div>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">Mortgage (P&I)</h4>
            
            <div className="grid md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Balance ($)</label>
                <input 
                  type="number"
                  step="1000"
                  className={inputCls}
                  value={form.currentMortgageBalance}
                  onChange={handleChange('currentMortgageBalance')}
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rate (%)</label>
                <input 
                  type="number"
                  step="0.125"
                  className={inputCls}
                  value={form.currentMortgageRate}
                  onChange={handleChange('currentMortgageRate')}
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Payment ($/month)</label>
                <input 
                  type="number"
                  step="10"
                  className={inputCls}
                  value={form.currentMortgagePayment}
                  onChange={handleChange('currentMortgagePayment')}
                />
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Years Left</label>
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
      
      {/* Expense Reference Modal */}
      {showExpenseReference && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-6xl max-h-90vh overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Expense Reference Values</h2>
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
                    <th className="text-right p-3 font-medium text-gray-900">Insurance/year</th>
                    <th className="text-right p-3 font-medium text-gray-900">County Tax %</th>
                    <th className="text-right p-3 font-medium text-gray-900">City Tax %</th>
                    <th className="text-right p-3 font-medium text-gray-900">HOA/mo</th>
                    <th className="text-right p-3 font-medium text-gray-900">Expenses/year</th>
                    <th className="text-right p-3 font-medium text-gray-900">Management %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {referenceProperties.map((property) => (
                    <tr key={property.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium text-gray-900">{property.address}</div>
                        <div className="text-xs text-gray-500">{property.city}, {property.state}</div>
                      </td>
                      <td className="p-3 text-right">
                        ${(property.current_insurance_annual || (property.insurance_monthly * 12) || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        {property.current_county_tax_rate || 'N/A'}%
                      </td>
                      <td className="p-3 text-right">
                        {property.current_city_tax_rate || 'N/A'}%
                      </td>
                      <td className="p-3 text-right">
                        ${(property.current_hoa_monthly || property.hoa_monthly || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        ${(property.current_expenses_annual || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        {property.current_management_pct || property.management_pct_rent || 0}%
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
            
            <div className="mt-6 text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded p-3">
              💡 <strong>Tip:</strong> Use these values as reference when editing current property values. 
              Similar properties in the same area often have comparable insurance, tax rates, and management costs.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}