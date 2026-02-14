'use client';

import React, { useEffect, useState } from 'react';
import FinancialPreview from '@/components/ui/FinancialPreview';

export default function PropertyDetailPage({ params }) {
  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchProperty() {
      try {
        const { id } = await params;
        const res = await fetch('/api/properties');
        if (!res.ok) throw new Error('Failed to fetch properties');
        const properties = await res.json();
        const found = properties.find(p => p.id === Number(id));
        if (!found) throw new Error('Property not found');
        setProperty(found);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchProperty();
  }, [params]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading property...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 mb-4">{error}</div>
          <a href="/" className="text-blue-600 hover:underline">Back to Portfolio</a>
        </div>
      </div>
    );
  }

  const p = property;
  const isOwned = p.purchased;

  // Map DB property fields to the form shape that FinancialPreview expects
  const form = {
    address: p.address || '',
    city: p.city || '',
    state: p.state || '',
    zip: p.zip || '',
    purchasePrice: p.purchase_price || 0,
    downPct: p.down_payment_pct || 20,
    rateApr: p.interest_apr_pct || 6.5,
    years: p.loan_years || 30,
    monthlyRent: p.monthly_rent || 0,
    taxPct: p.property_tax_pct || 1.2,
    taxAnnual: p.tax_annual || 0,
    taxInputMode: p.tax_input_mode || 'percentage',
    hoaMonthly: p.hoa_monthly || 0,
    insuranceMonthly: p.insurance_monthly || 120,
    maintPctRent: p.maintenance_pct_rent || 5,
    vacancyPctRent: p.vacancy_pct_rent || 5,
    mgmtPctRent: p.management_pct_rent ?? 8,
    otherMonthly: p.other_monthly || 0,
    initialInvestment: p.initial_investment || 0,
    closingCosts: p.closing_costs || 0,
    repairCosts: p.repair_costs || 0,
    mortgageFree: p.mortgage_free || false,
    purchased: p.purchased || false,
    currentAppraisalValue: p.current_appraisal_value || p.purchase_price || 0,
    currentCountyTaxRate: p.current_county_tax_rate || 0,
    currentCityTaxRate: p.current_city_tax_rate || 0,
    assessmentPercentage: p.assessment_percentage || 25,
    insuranceAnnual: p.current_insurance_annual || ((p.insurance_monthly || 0) * 12) || 0,
    currentMarketValue: p.current_market_value || p.purchase_price || 0,
    currentExpensesAnnual: p.current_expenses_annual || 0,
    currentMortgageBalance: p.current_mortgage_balance || 0,
    currentMortgageRate: p.current_mortgage_rate || p.interest_apr_pct || 0,
    currentMortgagePayment: p.current_mortgage_payment || 0,
    currentMortgageTermRemaining: p.current_mortgage_term_remaining || 0,
    originalMonthlyRent: p.original_monthly_rent || '',
    originalPropertyTaxPct: p.original_property_tax_pct || '',
    originalInsuranceMonthly: p.original_insurance_monthly || '',
    originalMaintenancePctRent: p.original_maintenance_pct_rent || '',
    originalVacancyPctRent: p.original_vacancy_pct_rent || '',
    originalManagementPctRent: p.original_management_pct_rent || '',
    originalDownPaymentPct: p.original_down_payment_pct || '',
    originalInterestAprPct: p.original_interest_apr_pct || '',
    originalLoanYears: p.original_loan_years || '',
    originalClosingCosts: p.original_closing_costs || '',
    originalRepairCosts: p.original_repair_costs || '',
    originalMortgageFree: p.original_mortgage_free || false,
  };

  const Money = (v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{p.address}</h1>
            <div className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${
              isOwned
                ? 'bg-green-100 text-green-800 border border-green-200'
                : 'bg-orange-100 text-orange-800 border border-orange-200'
            }`}>
              {isOwned ? 'OWNED' : 'PROJECTED'}
            </div>
          </div>
          <p className="text-gray-600">{p.city}, {p.state} {p.zip}</p>
          {p.purchased && p.year_purchased && (
            <p className="text-sm text-blue-600 mt-1">
              Purchased: {p.month_purchased
                ? `${new Date(0, p.month_purchased - 1).toLocaleString('default', { month: 'short' })} ${p.year_purchased}`
                : p.year_purchased}
            </p>
          )}
        </div>

        {/* Property Details */}
        {(p.bedrooms || p.bathrooms || p.square_footage || p.year_built) && (
          <div className="bg-white rounded-lg border p-4 mb-4">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Property Details</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              {p.bedrooms && (
                <div>
                  <div className="text-gray-600">Bedrooms</div>
                  <div className="font-medium text-gray-900">{p.bedrooms}</div>
                </div>
              )}
              {p.bathrooms && (
                <div>
                  <div className="text-gray-600">Bathrooms</div>
                  <div className="font-medium text-gray-900">{p.bathrooms}</div>
                </div>
              )}
              {p.square_footage && (
                <div>
                  <div className="text-gray-600">Sq Ft</div>
                  <div className="font-medium text-gray-900">{Number(p.square_footage).toLocaleString()}</div>
                </div>
              )}
              {p.year_built && (
                <div>
                  <div className="text-gray-600">Year Built</div>
                  <div className="font-medium text-gray-900">{p.year_built}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Financial Summary */}
        <div className="bg-white rounded-lg border p-4 mb-4">
          <h2 className="text-sm font-medium text-gray-900 mb-3">Financial Summary</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Purchase Price</div>
              <div className="font-medium text-gray-900">{Money(p.purchase_price)}</div>
            </div>
            {p.current_market_value && Number(p.current_market_value) !== Number(p.purchase_price) && (
              <div>
                <div className="text-gray-600">Current Market Value</div>
                <div className="font-medium text-blue-600">{Money(p.current_market_value)}</div>
              </div>
            )}
            <div>
              <div className="text-gray-600">Monthly Rent</div>
              <div className="font-medium text-gray-900">{Money(p.current_rent_monthly || p.monthly_rent)}</div>
            </div>
            {!p.mortgage_free ? (
              <>
                <div>
                  <div className="text-gray-600">Down Payment</div>
                  <div className="font-medium text-gray-900">{p.down_payment_pct}% ({Money(p.purchase_price * p.down_payment_pct / 100)})</div>
                </div>
                <div>
                  <div className="text-gray-600">Loan Terms</div>
                  <div className="font-medium text-gray-900">{p.interest_apr_pct}% APR, {p.loan_years}yr</div>
                </div>
              </>
            ) : (
              <div>
                <div className="text-gray-600">Mortgage</div>
                <div className="font-medium text-green-600">Owned Outright</div>
              </div>
            )}
            {(Number(p.closing_costs) > 0 || Number(p.repair_costs) > 0) && (
              <div>
                <div className="text-gray-600">Closing + Repairs</div>
                <div className="font-medium text-gray-900">{Money((Number(p.closing_costs) || 0) + (Number(p.repair_costs) || 0))}</div>
              </div>
            )}
          </div>
        </div>

        {/* Financial Analysis (reused FinancialPreview component) */}
        <FinancialPreview form={form} />

        {/* Notes */}
        {p.notes && (
          <div className="bg-white rounded-lg border p-4 mt-4">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Notes</h2>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{p.notes}</p>
          </div>
        )}

        {/* Back button */}
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            &larr; Back to Portfolio
          </a>
        </div>
      </div>
    </div>
  );
}
