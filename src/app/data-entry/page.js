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
  candidateProperty: true
};

export default function DataEntry() {
  const [form, setForm] = useState(DEFAULTS);
  const [errMsg, setErrMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  useEffect(() => {
    document.title = 'PI Data Entry';
  }, []);

  // Also set title immediately for new tabs
  if (typeof window !== 'undefined') {
    document.title = 'PI Data Entry';
  }

  const updateForm = (updates) => {
    setForm(prev => ({ ...prev, ...updates }));
  };

  async function onSubmit(e) {
    e.preventDefault();
    setErrMsg('');
    setSaving(true);
    
    try {
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      const savedProperty = await res.json();
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
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}

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
    </main>
  );
}