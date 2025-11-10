import React from 'react';
import { analyze } from '@/lib/finance';
import PropertyChart from '../PropertyChart';

export default function FinancialPreview({ form }) {
  // Calculate current taxes based on form values
  const assessedValue = (Number(form.currentAppraisalValue) || 0) * ((Number(form.assessmentPercentage) || 25) / 100);
  const calculatedTaxesAnnual = (
    (assessedValue * ((Number(form.currentCountyTaxRate) || 0) / 100)) +
    (assessedValue * ((Number(form.currentCityTaxRate) || 0) / 100))
  );
  
  // Use calculated taxes if we have appraisal data AND tax rates, otherwise fall back to form values
  const hasAppraisalData = form.currentAppraisalValue && (Number(form.currentCountyTaxRate) > 0 || Number(form.currentCityTaxRate) > 0);
  const currentTaxesAnnual = hasAppraisalData
    ? calculatedTaxesAnnual 
    : (Number(form.taxAnnual) || 0);
    
  console.log('🏠 EDIT PAGE Tax calc:', {
    currentAppraisalValue: form.currentAppraisalValue,
    assessmentPercentage: form.assessmentPercentage,
    currentCountyTaxRate: form.currentCountyTaxRate,
    currentCityTaxRate: form.currentCityTaxRate,
    hasAppraisalData,
    calculatedTaxesAnnual,
    fallbackTaxAnnual: form.taxAnnual,
    finalCurrentTaxesAnnual: currentTaxesAnnual
  });

  console.log('📝 EDIT PROPERTY PAGE - FinancialPreview analyze');
  const metrics = analyze({
    purchasePrice: Number(form.purchasePrice) || 0,
    downPct: Number(form.downPct) || 0,
    rateApr: Number(form.rateApr) || 0,
    years: Number(form.years) || 0,
    monthlyRent: Number(form.monthlyRent) || 0,
    taxPct: Number(form.taxPct) || 0,
    taxAnnual: Number(form.taxAnnual) || 0,
    taxInputMode: form.taxInputMode || 'percentage',
    hoaMonthly: Number(form.hoaMonthly) || 0,
    insuranceMonthly: Number(form.insuranceMonthly) || Number(form.insuranceAnnual) / 12 || 0,
    maintPctRent: Number(form.maintPctRent) || 0,
    vacancyPctRent: Number(form.vacancyPctRent) || 0,
    mgmtPctRent: Number(form.mgmtPctRent) || 0,
    otherMonthly: Number(form.otherMonthly) || 0,
    initialInvestment: Number(form.initialInvestment) || 0,
    closingCosts: Number(form.closingCosts) || 0,
    repairCosts: Number(form.repairCosts) || 0,
    mortgageFree: Boolean(form.mortgageFree),
    // Current values override - this will take priority in calculations
    currentTaxesAnnual: currentTaxesAnnual > 0 ? currentTaxesAnnual : null,
    currentExpensesAnnual: null, // Let it calculate from percentages
    currentMortgagePayment: null, // Let it calculate from loan terms
    propertyAddress: form.address || form.abbreviation || `Property $${form.purchasePrice}`
  });

  const Money = (v) => `$${Number(v).toLocaleString()}`;
  const Pct = (v) => `${Number(v).toFixed(2)}%`;

  // Sample chart data - in real app this would be projections
  const chartData = [
    { year: 2025 - 2, value: (form.purchasePrice || 0) * 0.95 },
    { year: 2025 - 1, value: (form.purchasePrice || 0) * 0.98 },
    { year: 2025, value: form.purchasePrice || 0 },
    { year: 2025 + 1, value: (form.purchasePrice || 0) * 1.03 },
    { year: 2025 + 2, value: (form.purchasePrice || 0) * 1.06 }
  ];

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">Financial Analysis</h2>
      
      {/* Property Chart */}
      {form.purchasePrice && (
        <div className="mb-6">
          <PropertyChart data={chartData} />
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <MetricCard 
          label="Cap Rate (trgt >6%)" 
          value={Pct(metrics.metrics.capRate)}
          description="Annual NOI / Purchase Price"
          color="blue"
        />
        <MetricCard 
          label="Cash-on-Cash (trgt >8%)" 
          value={Pct(metrics.metrics.cashOnCash)}
          description="Annual Cash Flow / Cash Invested"
          color="green"
        />
        <MetricCard 
          label="30y TRI (trgt >12%)" 
          value={Pct(metrics.metrics.tri30y)}
          description="30-Year Total Return w/ Inflation"
          color="purple"
        />
        <MetricCard 
          label="Gross Yield (trgt 8-12%)" 
          value={Pct(metrics.metrics.grossYield)}
          description="Annual Rent / Purchase Price"
          color="orange"
        />
      </div>

      {/* Additional Metrics Row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <MetricCard 
          label="30y ATROI (trgt >10%)" 
          value={Pct(metrics.metrics.atROI30y)}
          description="30-Year Conservative Formula"
          color="teal"
        />
      </div>

      {/* Cash Flow Breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Monthly Cash Flow</h3>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>Gross Rent:</span>
            <span className="text-green-600">{Money(form.monthlyRent || 0)}</span>
          </div>
          
          <div className="flex justify-between text-gray-700">
            <span>Operating Expenses:</span>
            <span className="text-red-600">-{Money(metrics.operatingExpenses)}</span>
          </div>
          
          <div className="flex justify-between text-gray-600">
            <span>• Property Taxes:</span>
            <span>-{Money(metrics.taxesMonthly)}</span>
          </div>
          
          <div className="flex justify-between text-gray-600">
            <span>• Insurance:</span>
            <span>-{Money(form.insuranceMonthly || 0)}</span>
          </div>
          
          <div className="flex justify-between text-gray-600">
            <span>• Maintenance:</span>
            <span>-{Money((form.monthlyRent || 0) * ((form.maintPctRent || 0) / 100))}</span>
          </div>
          
          <div className="flex justify-between text-gray-600">
            <span>• Vacancy:</span>
            <span>-{Money((form.monthlyRent || 0) * ((form.vacancyPctRent || 0) / 100))}</span>
          </div>
          
          <div className="flex justify-between text-gray-600">
            <span>• Management:</span>
            <span>-{Money((form.monthlyRent || 0) * ((form.mgmtPctRent || 0) / 100))}</span>
          </div>

          <div className="border-t pt-2">
            <div className="flex justify-between font-medium text-gray-700">
              <span>Net Operating Income:</span>
              <span className={metrics.noiMonthly >= 0 ? 'text-green-600' : 'text-red-600'}>
                {Money(metrics.noiMonthly)}
              </span>
            </div>
          </div>

          {!form.mortgageFree && (
            <div className="flex justify-between text-gray-700">
              <span>Mortgage Payment (P&I):</span>
              <span className="text-red-600">-{Money(metrics.pAndI)}</span>
            </div>
          )}

          <div className="border-t pt-2">
            <div className="flex justify-between font-semibold text-lg text-gray-800">
              <span>Cash Flow:</span>
              <span className={metrics.cashflowMonthly >= 0 ? 'text-green-600' : 'text-red-600'}>
                {Money(metrics.cashflowMonthly)}
              </span>
            </div>
          </div>

          {/* Mortgage-Free Cash Flow Analysis */}
          {!form.mortgageFree && (
            <>
              <div className="mt-4 pt-3 border-t border-gray-200 bg-blue-50 rounded-lg p-3">
                <h4 className="text-sm font-medium text-blue-800 mb-2">If Mortgage Paid Off</h4>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-700">Cash Flow (No Mortgage):</span>
                  <span className="font-semibold text-blue-800">
                    {Money(metrics.noiMonthly)} <span className="text-xs text-blue-600">(+{Money(metrics.pAndI)})</span>
                  </span>
                </div>
                <div className="flex justify-between text-xs text-blue-600 mt-1">
                  <span>Cash-on-Equity Return:</span>
                  <span>
                    {(() => {
                      // Calculate current equity (property value minus remaining loan balance)
                      const propertyValue = Number(form.currentMarketValue) || Number(form.purchasePrice) || 0;
                      const loanBalance = propertyValue * (1 - (Number(form.downPct) || 20) / 100) * 0.8; // Estimate remaining balance
                      const currentEquity = propertyValue - loanBalance;
                      const annualNOI = metrics.noiMonthly * 12;
                      const cashOnEquityReturn = currentEquity > 0 ? (annualNOI / currentEquity) * 100 : 0;
                      return `${cashOnEquityReturn.toFixed(2)}%`;
                    })()}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Investment Summary */}
      <div className="mt-6 pt-4 border-t">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Investment Summary</h3>
        <div className="space-y-1 text-sm text-gray-700">
          <div className="flex justify-between">
            <span>Purchase Price:</span>
            <span>{Money(form.purchasePrice || 0)}</span>
          </div>
          <div className="flex justify-between">
            <span>Down Payment:</span>
            <span>{Money(metrics.down)}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Investment:</span>
            <span className="font-medium">{Money(form.initialInvestment || metrics.down)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, description, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    teal: 'bg-teal-100 text-teal-900 border-teal-300'
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-gray-600 mt-1">{description}</div>
    </div>
  );
}
