import React, { useState } from 'react';
import StaticPropertyDetails from './StaticPropertyDetails';
import CurrentAnnualValues from './CurrentAnnualValues';
import MortgageCalculator from './MortgageCalculator';
import FinancialPreview from '@/components/ui/FinancialPreview';

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
    mgmtPctRent: property.management_pct_rent ?? 8,
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
    abbreviation: property.abbreviation || '',
    countyTaxWebsite: property.county_tax_website || '',
    cityTaxWebsite: property.city_tax_website || '',
    notes: property.notes || '',
    // Current property values for accurate calculations
    currentAppraisalValue: property.current_appraisal_value || property.purchase_price || 0,
    currentCountyTaxRate: property.current_county_tax_rate || 0,
    currentCityTaxRate: property.current_city_tax_rate || 0,
    assessmentPercentage: property.assessment_percentage || 25,
    insuranceAnnual: property.current_insurance_annual || (property.insurance_monthly * 12) || 0,
    currentMarketValue: property.current_market_value || property.purchase_price || 0,
    currentExpensesAnnual: property.current_expenses_annual || 0,
    currentMortgageBalance: property.current_mortgage_balance || 0,
    currentMortgageRate: property.current_mortgage_rate || property.interest_apr_pct || 0,
    currentMortgagePayment: property.current_mortgage_payment || 0,
    currentMortgageTermRemaining: property.current_mortgage_term_remaining || 0
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const updateForm = (updates) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    
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
        taxInputMode: form.taxInputMode,
        // Current property values
        currentAppraisalValue: form.currentAppraisalValue,
        currentCountyTaxRate: form.currentCountyTaxRate,
        currentCityTaxRate: form.currentCityTaxRate,
        assessmentPercentage: form.assessmentPercentage,
        currentInsuranceAnnual: form.insuranceAnnual,
        currentMarketValue: form.currentMarketValue,
        currentExpensesAnnual: form.currentExpensesAnnual,
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
        const errorData = await res.json();
        console.error('API Error:', errorData);
        throw new Error(errorData.error || 'Failed to update property');
      }
      
      onUpdate(await res.json());
    } catch (error) {
      console.error('Failed to update property:', error);
      setError(error.message || 'Failed to update property');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Property Details</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {/* Row 1: Static Property Details */}
        <div className="grid lg:grid-cols-1 gap-8">
          <StaticPropertyDetails 
            form={form} 
            updateForm={updateForm}
            inputCls="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            saving={saving}
          />
        </div>

        {/* Row 2: Current Annual Values */}
        <div className="grid lg:grid-cols-1 gap-8">
          <CurrentAnnualValues 
            form={form} 
            updateForm={updateForm}
            inputCls="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            saving={saving}
            property={property}
          />
        </div>

        {/* Row 3: Financial Analysis & Mortgage Calculator */}
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Mortgage Calculator */}
          <MortgageCalculator 
            form={form}
            updateForm={updateForm}
            propertyId={property.id}
          />

          {/* Financial Preview */}
          <FinancialPreview form={form} />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Update Property'}
        </button>
      </div>
    </main>
  );
}