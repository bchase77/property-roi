'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import PropertyForm from '@/components/forms/PropertyForm';
import MortgageCalculator from '@/components/forms/MortgageCalculator';
import FinancialPreview from '@/components/ui/FinancialPreview';
import PageHeader from '@/components/ui/PageHeader';

const DEFAULTS = {
  address: '', city: '', state: '', zip: '',
  purchasePrice: 500000, downPct: 20, rateApr: 6.5, years: 30,
  monthlyRent: 2800, taxPct: 1.2, taxAnnual: 6000, taxInputMode: 'percentage', hoaMonthly: 0, insuranceMonthly: 120,
  maintPctRent: 5, vacancyPctRent: 5, mgmtPctRent: 8, otherMonthly: 0,
  purchased: false, yearPurchased: '',
  initialInvestment: 0, mortgageFree: false,
  mortgagePayoffDate: '',
  candidateProperty: true,
  closingCosts: 0,
  repairCosts: 0
};

export default function DataEntry() {
  const [form, setForm] = useState(DEFAULTS);
  const [errMsg, setErrMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [showExpenseReference, setShowExpenseReference] = useState(false);
  const [referenceProperties, setReferenceProperties] = useState([]);
  const router = useRouter();

  useEffect(() => {
    document.title = 'DE - Data Entry';
  }, []);

  // Also set title immediately for new tabs
  if (typeof window !== 'undefined') {
    document.title = 'DE - Data Entry';
  }

  const updateForm = (updates) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  const loadReferenceProperties = async () => {
    try {
      const { default: apiClient } = await import('@/lib/apiClient');
      const properties = await apiClient.getProperties();
      setReferenceProperties(properties);
      setShowExpenseReference(true);
    } catch (error) {
      console.error('Failed to load reference properties:', error);
    }
  };

  async function onSubmit(e) {
    e.preventDefault();
    setErrMsg('');
    setSaving(true);
    
    try {
      // Use offline-capable API client
      const { default: apiClient } = await import('@/lib/apiClient');
      const savedProperty = await apiClient.addProperty(form);
      
      // Check if it was saved offline
      if (savedProperty.isOfflineCreated) {
        setErrMsg('⚠️ Property saved locally (offline mode). Will sync when connection returns.');
      }
      
      router.push(`/analysis?property=${savedProperty.id}`);
    } catch (err) {
      console.error(err);
      setErrMsg('Failed to save property.');
    } finally {
      setSaving(false);
    }
  }

  const resetForm = () => {
    setForm(DEFAULTS);
    setErrMsg('');
  };

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <PageHeader 
        title="Property Analysis Tool"
        subtitle="Enter property details to analyze investment potential"
        currentPage="/data-entry"
      />

      {errMsg && (
        <div className={`rounded-md border px-4 py-3 text-sm ${
          errMsg.includes('locally') 
            ? 'border-blue-200 bg-blue-50 text-blue-700' 
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {errMsg}
        </div>
      )}

      {/* Reference values button and offline persistence warning */}
      <div className="space-y-3">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          💾 <strong>Data persistence:</strong> Properties are stored in your browser. 
          Don't clear browser data to avoid losing offline changes before they sync.
        </div>
        
        <div className="flex justify-center">
          <button
            onClick={loadReferenceProperties}
            className="px-6 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2"
          >
            📊 Show Reference Values From Other Properties
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Property Details Form */}
        <div className="lg:col-span-1 space-y-6">
          <PropertyForm 
            form={form} 
            updateForm={updateForm}
            onSubmit={onSubmit}
            onReset={resetForm}
            saving={saving}
          />
        </div>

        {/* Mortgage Calculator */}
        <div className="lg:col-span-1 space-y-6">
          <MortgageCalculator 
            form={form}
            updateForm={updateForm}
          />
        </div>

        {/* Financial Preview */}
        <div className="lg:col-span-1">
          <FinancialPreview form={form} />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-center space-x-4">
        <button
          type="button"
          onClick={resetForm}
          className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
        >
          Reset Form
        </button>
        <button
          onClick={onSubmit}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & Analyze'}
        </button>
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
                    <th className="text-right p-3 font-medium text-gray-900">Insurance/mo</th>
                    <th className="text-right p-3 font-medium text-gray-900">Tax Rate %</th>
                    <th className="text-right p-3 font-medium text-gray-900">Tax Annual</th>
                    <th className="text-right p-3 font-medium text-gray-900">HOA/mo</th>
                    <th className="text-right p-3 font-medium text-gray-900">Other/mo</th>
                    <th className="text-right p-3 font-medium text-gray-900">Maintenance %</th>
                    <th className="text-right p-3 font-medium text-gray-900">Vacancy %</th>
                    <th className="text-right p-3 font-medium text-gray-900">Mgmt %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {referenceProperties.map((property) => (
                    <tr key={property.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <div className="font-medium text-gray-900">{property.address}</div>
                        <div className="text-xs text-gray-600">{property.city}, {property.state}</div>
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${(property.current_insurance_monthly || property.insurance_monthly || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        {property.current_property_tax_pct || property.property_tax_pct || 'N/A'}%
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${(property.tax_annual || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${(property.hoa_monthly || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        ${(property.other_monthly_expenses || 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        {property.current_maintenance_pct_rent || property.maintenance_pct_rent || 0}%
                      </td>
                      <td className="p-3 text-right text-gray-900">
                        {property.current_vacancy_pct_rent || property.vacancy_pct_rent || 0}%
                      </td>
                      <td className="p-3 text-right text-gray-900">
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
              💡 <strong>Tip:</strong> Use these values as reference when entering expenses for your new property. 
              Similar properties in the same area often have comparable insurance, tax rates, and management costs.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}