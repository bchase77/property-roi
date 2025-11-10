import React, { useState } from 'react';
import StaticPropertyDetails from './StaticPropertyDetails';
import CurrentAnnualValues from './CurrentAnnualValues';
import MortgageCalculator from './MortgageCalculator';
import FinancialPreview from '@/components/ui/FinancialPreview';
import { fetchCrimeDataByLocation, formatCrimeIndex } from '@/lib/crime';

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
    closingCosts: property.closing_costs || 0,
    repairCosts: property.repair_costs || 0,
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
    insuranceAnnual: property.current_insurance_annual || ((property.insurance_monthly || 0) * 12) || 0,
    currentMarketValue: property.current_market_value || property.purchase_price || 0,
    currentExpensesAnnual: property.current_expenses_annual || 0,
    currentMortgageBalance: property.current_mortgage_balance || 0,
    currentMortgageRate: property.current_mortgage_rate || property.interest_apr_pct || 0,
    currentMortgagePayment: property.current_mortgage_payment || 0,
    currentMortgageTermRemaining: property.current_mortgage_term_remaining || 0
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fetchingCrime, setFetchingCrime] = useState(false);
  const [crimeData, setCrimeData] = useState(null);

  const updateForm = (updates) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const handleFetchCrimeData = async () => {
    if (!form.city || !form.state) {
      setError('Please enter city and state before fetching crime data');
      return;
    }

    try {
      setFetchingCrime(true);
      setError('');
      
      console.log('🔍 Fetching local crime data for:', { 
        address: form.address,
        city: form.city, 
        state: form.state 
      });
      
      // Pass the full address for geocoding and radius-based search
      const crimeResult = await fetchCrimeDataByLocation(
        form.city, 
        form.state, 
        form.address // Include address for better location targeting
      );
      
      setCrimeData(crimeResult);
      
      // Update the form with the crime data
      updateForm({ 
        crimeIndex: crimeResult.crimeIndex || crimeResult.crimeScore || 5,
        crimeScore: crimeResult.crimeScore,
        riskLevel: crimeResult.riskLevel
      });
      
      console.log('✅ Local crime data fetched successfully:', crimeResult);
    } catch (error) {
      console.error('❌ Failed to fetch crime data:', error);
      setError(`Failed to fetch crime data: ${error.message}`);
      setCrimeData(null);
    } finally {
      setFetchingCrime(false);
    }
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

      {/* Crime Data Section */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Neighborhood Safety</h2>
          <button
            type="button"
            onClick={handleFetchCrimeData}
            disabled={fetchingCrime || !form.city || !form.state}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {fetchingCrime ? (
              <>
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Fetching...
              </>
            ) : (
              <>
                🔍 Fetch Crime Data
              </>
            )}
          </button>
        </div>
        
        {crimeData && (
          <div className="space-y-4">
            {/* Crime Index and Source */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Crime Index</label>
                <div className="flex items-center gap-3">
                  <div className={`text-2xl font-bold ${
                    formatCrimeIndex(crimeData.crimeIndex || crimeData.crimeScore || 5).color === 'green' ? 'text-green-600' :
                    formatCrimeIndex(crimeData.crimeIndex || crimeData.crimeScore || 5).color === 'yellow' ? 'text-yellow-600' : 'text-red-600'
                  }`}>
                    {(crimeData.crimeIndex || crimeData.crimeScore || 5).toFixed(1)}
                  </div>
                  <div className={`px-2 py-1 rounded text-sm font-medium ${
                    formatCrimeIndex(crimeData.crimeIndex || crimeData.crimeScore || 5).color === 'green' ? 'bg-green-100 text-green-800' :
                    formatCrimeIndex(crimeData.crimeIndex || crimeData.crimeScore || 5).color === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {formatCrimeIndex(crimeData.crimeIndex || crimeData.crimeScore || 5).label}
                  </div>
                </div>
                {crimeData.riskLevel && (
                  <div className="text-xs text-gray-600 mt-1">
                    {crimeData.riskLevel}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data Source</label>
                <div className="text-sm text-gray-600">
                  {crimeData.source || crimeData.agency?.name || 'FBI Crime Data'}
                  <br />
                  <span className="text-xs">Updated: {new Date(crimeData.lastUpdated).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            {/* Enhanced Statistics */}
            <div className="bg-gray-50 rounded-lg p-3">
              <h4 className="text-sm font-medium text-gray-900 mb-2">
                {crimeData.searchRadius ? `Crime Analysis (${crimeData.searchRadius} mile radius)` : 'Crime Statistics'}
              </h4>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                {/* Total Incidents */}
                {crimeData.totalIncidents !== undefined && (
                  <div>
                    <span className="text-gray-600">Total Incidents:</span>
                    <span className="ml-2 font-medium">{crimeData.totalIncidents.toLocaleString()}</span>
                  </div>
                )}
                
                {/* Timeframe */}
                {crimeData.timeframe && (
                  <div>
                    <span className="text-gray-600">Timeframe:</span>
                    <span className="ml-2 font-medium">{crimeData.timeframe}</span>
                  </div>
                )}
                
                {/* Trend Data */}
                {crimeData.trends && (
                  <>
                    {crimeData.trends.violentCrimes !== undefined && (
                      <div>
                        <span className="text-gray-600">Violent Crimes:</span>
                        <span className="ml-2 font-medium text-red-600">{crimeData.trends.violentCrimes}</span>
                      </div>
                    )}
                    {crimeData.trends.propertyCrimes !== undefined && (
                      <div>
                        <span className="text-gray-600">Property Crimes:</span>
                        <span className="ml-2 font-medium text-orange-600">{crimeData.trends.propertyCrimes}</span>
                      </div>
                    )}
                    {crimeData.trends.recentIncidents !== undefined && (
                      <div>
                        <span className="text-gray-600">Recent (30 days):</span>
                        <span className="ml-2 font-medium">{crimeData.trends.recentIncidents}</span>
                      </div>
                    )}
                  </>
                )}
                
                {/* Legacy FBI data format */}
                {crimeData.crimeData && (
                  <>
                    <div>
                      <span className="text-gray-600">Violent Crimes:</span>
                      <span className="ml-2 font-medium">{crimeData.crimeData.violent_crime?.toLocaleString() || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Property Crimes:</span>
                      <span className="ml-2 font-medium">{crimeData.crimeData.property_crime?.toLocaleString() || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Population:</span>
                      <span className="ml-2 font-medium">{crimeData.crimeData.population?.toLocaleString() || 'N/A'}</span>
                    </div>
                  </>
                )}
              </div>
              
              {/* Search coordinates display */}
              {crimeData.coordinates && (
                <div className="mt-2 text-xs text-gray-500">
                  📍 Search location: {crimeData.coordinates.lat.toFixed(4)}, {crimeData.coordinates.lng.toFixed(4)}
                </div>
              )}
            </div>
            
            {/* Recent incidents preview (if available) */}
            {crimeData.recentIncidents && crimeData.recentIncidents.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <h4 className="text-sm font-medium text-yellow-900 mb-2">Recent Incidents ({crimeData.recentIncidents.length})</h4>
                <div className="space-y-1 text-xs">
                  {crimeData.recentIncidents.slice(0, 3).map((incident, idx) => (
                    <div key={idx} className="text-yellow-800">
                      • {incident.ucr_description || incident.type || 'Incident'} - {incident.offense_date ? new Date(incident.offense_date).toLocaleDateString() : 'Recent'}
                    </div>
                  ))}
                  {crimeData.recentIncidents.length > 3 && (
                    <div className="text-yellow-600 font-medium">
                      ... and {crimeData.recentIncidents.length - 3} more recent incidents
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        
        {!crimeData && !fetchingCrime && (
          <p className="text-gray-600 text-sm">
            Enter city and state above, then click "Fetch Crime Data" to get neighborhood safety information.
          </p>
        )}
      </div>

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