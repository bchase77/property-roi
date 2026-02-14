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

  const Money = (v) => `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
        <MetricCard
          label="DSCR (trgt >1.25)"
          value={form.mortgageFree ? 'N/A' : metrics.metrics.dscr.toFixed(2)}
          description="NOI / Mortgage Payment"
          color={form.mortgageFree ? 'indigo' : metrics.metrics.dscr >= 1.25 ? 'green' : metrics.metrics.dscr >= 1.0 ? 'orange' : 'purple'}
        />
      </div>

      {/* Additional Metrics Row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {(() => {
          // Calculate the correct 30yATROI using the same logic as the detailed breakdown
          const hasOriginalValues = !!(form.originalMonthlyRent || form.originalPropertyTaxPct || form.originalInsuranceMonthly || form.originalMaintenancePctRent || form.originalVacancyPctRent || form.originalManagementPctRent || form.originalDownPaymentPct || form.originalInterestAprPct);
          
          // Use the recalculated value from our detailed breakdown when original values exist
          let correctAtROI = metrics.metrics.atROI30y;
          
          if (hasOriginalValues) {
            // Recalculate using original values (same logic as detailed breakdown)
            const purchasePrice = Number(form.purchasePrice) || 0;
            const monthlyRent = Number(form.originalMonthlyRent) || Number(form.monthlyRent) || 0;
            const vacancyPctRent = Number(form.originalVacancyPctRent) || Number(form.vacancyPctRent) || 0;
            const years = 30;
            
            const downPayment = purchasePrice * (Number(form.downPct) / 100);
            const amountPaid = downPayment + (Number(form.closingCosts) || 0) + (Number(form.repairCosts) || 0);
            const effectiveMonthlyRent = monthlyRent * (1 - vacancyPctRent / 100);
            const incomeEarnedFor30y = effectiveMonthlyRent * 12 * years;
            const totalValue = purchasePrice + incomeEarnedFor30y;
            
            // Calculate original mortgage payment
            let originalMortgagePayment = 0;
            if (form.originalDownPaymentPct && form.originalInterestAprPct && form.originalLoanYears && !form.originalMortgageFree) {
              const originalDownPct = Number(form.originalDownPaymentPct);
              const originalRate = Number(form.originalInterestAprPct) / 100;
              const originalYears = Number(form.originalLoanYears);
              const originalLoanAmount = purchasePrice * (1 - originalDownPct / 100);
              
              if (originalLoanAmount > 0 && originalRate > 0) {
                const monthlyRate = originalRate / 12;
                const numPayments = originalYears * 12;
                originalMortgagePayment = originalLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
              }
            }
            
            // Calculate expenses using original values
            const mgmtPctRent = Number(form.originalManagementPctRent) || Number(form.mgmtPctRent) || 0;
            const maintPctRent = Number(form.originalMaintenancePctRent) || Number(form.maintPctRent) || 0;
            const insuranceMonthly = Number(form.originalInsuranceMonthly) || Number(form.insuranceMonthly) || Number(form.insuranceAnnual) / 12 || 0;
            const hoaMonthly = Number(form.hoaMonthly) || 0;
            
            const taxesMonthly = form.originalPropertyTaxPct 
              ? (purchasePrice * Number(form.originalPropertyTaxPct) / 100) / 12
              : (Number(form.taxAnnual) || 0) / 12;
            
            let totalExpenses = amountPaid;
            const totalManagement = monthlyRent * 12 * years * (mgmtPctRent / 100);
            const mortgagePaymentToUse = originalMortgagePayment > 0 ? originalMortgagePayment : metrics.pAndI;
            const totalMortgagePayments = mortgagePaymentToUse * 12 * years;
            const totalPropertyTaxes = taxesMonthly * 12 * years;
            const totalMaintenanceExpenses = monthlyRent * 12 * years * (maintPctRent / 100);
            const totalInsurance = insuranceMonthly * 12 * years;
            const totalHOA = hoaMonthly * 12 * years;
            
            totalExpenses += totalManagement + totalMortgagePayments + totalPropertyTaxes + totalMaintenanceExpenses + totalInsurance + totalHOA;
            
            // Add income tax
            const totalClosingCosts = Number(form.closingCosts) || 0;
            const depreciableBasis = purchasePrice + totalClosingCosts + (insuranceMonthly * 12);
            const monthlyDepreciation = (depreciableBasis / 27.5) / 12;
            const monthlyManagement = monthlyRent * (mgmtPctRent / 100);
            const monthlyMaintenance = monthlyRent * (maintPctRent / 100);
            const monthlyTaxableIncome = effectiveMonthlyRent - monthlyManagement - monthlyMaintenance - insuranceMonthly - monthlyDepreciation - taxesMonthly;
            const monthlyIncomeTax = Math.max(0, monthlyTaxableIncome * 0.44);
            const totalIncomeTax = monthlyIncomeTax * 12 * years;
            
            totalExpenses += totalIncomeTax;
            
            const netValue = totalValue - totalExpenses;
            correctAtROI = amountPaid > 0 ? ((netValue / amountPaid) / years) * 100 : 0;
          }
          
          return (
            <MetricCard 
              label="30y ATROI (trgt >10%)" 
              value={Pct(correctAtROI)}
              description={hasOriginalValues ? "Using Original Purchase Values" : "30-Year Conservative Formula"}
              color="teal"
            />
          );
        })()}
        {metrics.metrics.originalAtROI30y !== metrics.metrics.atROI30y && (
          <MetricCard 
            label="Current 30y ATROI" 
            value={Pct(metrics.metrics.atROI30y)}
            description="Using Current Property Values"
            color="indigo"
          />
        )}
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
            <span>Operating Expenses (incl. vacancy):</span>
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
            <span>• Management:</span>
            <span>-{Money((form.monthlyRent || 0) * ((form.mgmtPctRent || 0) / 100))}</span>
          </div>

          {Number(form.hoaMonthly) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>• HOA:</span>
              <span>-{Money(form.hoaMonthly)}</span>
            </div>
          )}

          {Number(form.otherMonthly) > 0 && (
            <div className="flex justify-between text-gray-600">
              <span>• Other:</span>
              <span>-{Money(form.otherMonthly)}</span>
            </div>
          )}

          <div className="border-t pt-2">
            <div className="flex justify-between font-medium text-gray-700">
              <span>Net Operating Income:</span>
              <span className={metrics.noiMonthly >= 0 ? 'text-green-600' : 'text-red-600'}>
                {Money(metrics.noiMonthly)}
              </span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              NOI excludes vacancy ({form.vacancyPctRent || 0}% = {Money((form.monthlyRent || 0) * ((form.vacancyPctRent || 0) / 100))}/mo)
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

          {/* Cash Purchase Scenario (100% Down) */}
          {!form.purchased && Number(form.downPct) < 100 && (
            <>
              <div className="mt-4 pt-3 border-t border-gray-200 bg-purple-50 rounded-lg p-3">
                <h4 className="text-sm font-medium text-purple-800 mb-2">Cash Purchase Scenario (100% Down)</h4>
                {(() => {
                  // Calculate cash purchase scenario
                  const purchasePrice = Number(form.purchasePrice) || 0;
                  const closingCosts = Number(form.closingCosts) || 0;
                  const repairCosts = Number(form.repairCosts) || 0;
                  const totalCashInvestment = purchasePrice + closingCosts + repairCosts;
                  
                  const cashPurchaseMetrics = analyze({
                    purchasePrice: purchasePrice,
                    downPct: 100,
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
                    initialInvestment: totalCashInvestment,
                    closingCosts: closingCosts,
                    repairCosts: repairCosts,
                    mortgageFree: true,
                    currentTaxesAnnual: currentTaxesAnnual > 0 ? currentTaxesAnnual : null,
                    propertyAddress: form.address || form.abbreviation || `Property $${form.purchasePrice}`
                  });

                  return (
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-purple-700">Cash Flow (No Mortgage):</span>
                        <span className={`font-semibold ${cashPurchaseMetrics.cashflowMonthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {Money(cashPurchaseMetrics.cashflowMonthly)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-700">Net Operating Income:</span>
                        <span className="text-purple-600">{Money(cashPurchaseMetrics.noiMonthly)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-700">Cash-on-Cash:</span>
                        <span className="font-semibold text-purple-800">{Pct(cashPurchaseMetrics.metrics.cashOnCash)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-purple-700">30y ATROI:</span>
                        <span className="font-semibold text-purple-800">{Pct(cashPurchaseMetrics.metrics.atROI30y)}</span>
                      </div>
                      <div className="text-xs text-purple-600 mt-1">
                        Total Cash Investment: {Money(totalCashInvestment)} (purchase price + closing costs + repairs)
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>
          )}
        </div>
      </div>

      {/* 30yATROI Detailed Calculation Breakdown */}
      <div className="mt-6 pt-4 border-t">
        <h3 className="text-sm font-medium text-gray-900 mb-3">30y ATROI Calculation Steps</h3>
        <div className="bg-gray-50 rounded-lg p-4 space-y-3 text-sm">
          {(() => {
            // Determine whether to use original or current values
            const hasOriginalValues = !!(form.originalMonthlyRent || form.originalPropertyTaxPct || form.originalInsuranceMonthly || form.originalMaintenancePctRent || form.originalVacancyPctRent || form.originalManagementPctRent || form.originalDownPaymentPct || form.originalInterestAprPct);
            
            console.log('🔍 FinancialPreview Debug:', {
              hasOriginalValues,
              originalMonthlyRent: form.originalMonthlyRent,
              originalDownPaymentPct: form.originalDownPaymentPct,
              originalInterestAprPct: form.originalInterestAprPct,
              currentRent: form.monthlyRent,
              propertyAddress: form.address
            });
            
            // Use original values if available, otherwise current values
            const purchasePrice = Number(form.purchasePrice) || 0;
            const monthlyRent = hasOriginalValues ? (Number(form.originalMonthlyRent) || Number(form.monthlyRent) || 0) : (Number(form.monthlyRent) || 0);
            const vacancyPctRent = hasOriginalValues ? (Number(form.originalVacancyPctRent) || Number(form.vacancyPctRent) || 0) : (Number(form.vacancyPctRent) || 0);
            const mgmtPctRent = hasOriginalValues ? (Number(form.originalManagementPctRent) || Number(form.mgmtPctRent) || 0) : (Number(form.mgmtPctRent) || 0);
            const maintPctRent = hasOriginalValues ? (Number(form.originalMaintenancePctRent) || Number(form.maintPctRent) || 0) : (Number(form.maintPctRent) || 0);
            const insuranceMonthly = hasOriginalValues ? (Number(form.originalInsuranceMonthly) || Number(form.insuranceMonthly) || Number(form.insuranceAnnual) / 12 || 0) : (Number(form.insuranceMonthly) || Number(form.insuranceAnnual) / 12 || 0);
            const hoaMonthly = Number(form.hoaMonthly) || 0;
            const years = 30;
            
            // Use original tax rate if provided, otherwise current taxes
            const taxesMonthly = hasOriginalValues && form.originalPropertyTaxPct 
              ? (purchasePrice * Number(form.originalPropertyTaxPct) / 100) / 12
              : currentTaxesAnnual / 12;
            
            const totalClosingCosts = Number(form.closingCosts) || 0;
            const mortgageFree = Boolean(form.mortgageFree);
            
            // Amount paid calculation
            const downPayment = purchasePrice * (Number(form.downPct) / 100);
            const closingCosts = Number(form.closingCosts) || 0;
            const repairCosts = Number(form.repairCosts) || 0;
            const amountPaid = downPayment + closingCosts + repairCosts;
            
            // Income calculation
            const effectiveMonthlyRent = monthlyRent * (1 - vacancyPctRent / 100);
            const incomeEarnedFor30y = effectiveMonthlyRent * 12 * years;
            
            // Total value calculation
            const totalValue = purchasePrice + incomeEarnedFor30y;
            
            // Calculate original mortgage payment if original terms exist
            let originalMortgagePayment = 0;
            
            console.log('🏦 Original Mortgage Debug:', {
              hasOriginalValues,
              originalDownPaymentPct: form.originalDownPaymentPct,
              originalInterestAprPct: form.originalInterestAprPct,
              originalLoanYears: form.originalLoanYears,
              originalMortgageFree: form.originalMortgageFree,
              purchasePrice: purchasePrice
            });
            
            if (hasOriginalValues && form.originalDownPaymentPct && form.originalInterestAprPct && form.originalLoanYears && !form.originalMortgageFree) {
              const originalDownPct = Number(form.originalDownPaymentPct);
              const originalRate = Number(form.originalInterestAprPct) / 100;
              const originalYears = Number(form.originalLoanYears);
              const originalLoanAmount = purchasePrice * (1 - originalDownPct / 100);
              
              console.log('🏦 Mortgage Calculation Inputs:', {
                originalDownPct,
                originalRate,
                originalYears,
                originalLoanAmount: originalLoanAmount.toFixed(2)
              });
              
              if (originalLoanAmount > 0 && originalRate > 0) {
                const monthlyRate = originalRate / 12;
                const numPayments = originalYears * 12;
                originalMortgagePayment = originalLoanAmount * (monthlyRate * Math.pow(1 + monthlyRate, numPayments)) / (Math.pow(1 + monthlyRate, numPayments) - 1);
                
                console.log('🏦 Mortgage Payment Calculated:', {
                  monthlyRate: monthlyRate.toFixed(6),
                  numPayments,
                  originalMortgagePayment: originalMortgagePayment.toFixed(2)
                });
              } else {
                console.log('🚫 Skipping mortgage calculation: loanAmount or rate is zero');
              }
            } else {
              console.log('🚫 Skipping original mortgage calculation - missing data or mortgage-free');
            }

            // Total expenses calculation
            let totalExpenses = amountPaid;
            const totalManagement = monthlyRent * 12 * years * (mgmtPctRent / 100);
            // Use original mortgage payment if available, otherwise current mortgage payment
            const mortgagePaymentToUse = originalMortgagePayment > 0 ? originalMortgagePayment : metrics.pAndI;
            const totalMortgagePayments = mortgagePaymentToUse * 12 * years;
            
            console.log('💳 Expense Calculation Debug:', {
              originalMortgagePayment: originalMortgagePayment.toFixed(2),
              currentMetricsPAndI: metrics.pAndI.toFixed(2),
              mortgagePaymentToUse: mortgagePaymentToUse.toFixed(2),
              totalMortgagePayments: totalMortgagePayments.toFixed(2),
              usingOriginalMortgage: originalMortgagePayment > 0
            });
            const totalPropertyTaxes = taxesMonthly * 12 * years;
            const totalMaintenanceExpenses = monthlyRent * 12 * years * (maintPctRent / 100);
            const totalInsurance = insuranceMonthly * 12 * years;
            const totalHOA = hoaMonthly * 12 * years;
            
            totalExpenses += totalManagement + totalMortgagePayments + totalPropertyTaxes + totalMaintenanceExpenses + totalInsurance + totalHOA;
            
            // Income tax calculation
            const depreciableBasis = purchasePrice + totalClosingCosts + (insuranceMonthly * 12);
            const monthlyDepreciation = (depreciableBasis / 27.5) / 12;
            const monthlyManagement = monthlyRent * (mgmtPctRent / 100);
            const monthlyMaintenance = monthlyRent * (maintPctRent / 100);
            const monthlyTaxableIncome = effectiveMonthlyRent - monthlyManagement - monthlyMaintenance - insuranceMonthly - monthlyDepreciation - taxesMonthly;
            const monthlyIncomeTax = Math.max(0, monthlyTaxableIncome * 0.44);
            const totalIncomeTax = monthlyIncomeTax * 12 * years;
            
            totalExpenses += totalIncomeTax;
            
            // Final calculation
            const netValue = totalValue - totalExpenses;
            const atROI = amountPaid > 0 ? ((netValue / amountPaid) / years) * 100 : 0;
            
            console.log('💰 30yATROI Calculation Debug for Trail Lake:', {
              monthlyRent: monthlyRent,
              totalValue: totalValue.toFixed(2),
              totalExpenses: totalExpenses.toFixed(2),
              netValue: netValue.toFixed(2),
              amountPaid: amountPaid.toFixed(2),
              atROI: atROI.toFixed(2),
              originalMortgagePayment: originalMortgagePayment.toFixed(2),
              totalMortgagePayments: totalMortgagePayments.toFixed(2),
              hasOriginalValues
            });
            
            return (
              <>
                <div className="font-medium text-gray-800 text-base mb-3">
                  Formula: (Total Value - Total Expenses) ÷ Amount Paid ÷ 30 years
                  {hasOriginalValues && (
                    <div className="text-sm text-blue-600 font-normal mt-1">
                      🕰️ Using original purchase-time values where available
                    </div>
                  )}
                </div>
                
                {/* Step 1: Amount Paid */}
                <div className="bg-white border rounded p-3">
                  <div className="font-medium text-blue-800 mb-2">1. Amount Paid</div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-900">
                    <div>Down Payment ({form.downPct}%):</div>
                    <div className="text-right">{Money(downPayment)}</div>
                    <div>Closing Costs:</div>
                    <div className="text-right">{Money(closingCosts)}</div>
                    <div>Repair Costs:</div>
                    <div className="text-right">{Money(repairCosts)}</div>
                    <div className="font-medium border-t pt-1">Total Amount Paid:</div>
                    <div className="text-right font-medium border-t pt-1">{Money(amountPaid)}</div>
                  </div>
                </div>
                
                {/* Step 2: Income */}
                <div className="bg-white border rounded p-3">
                  <div className="font-medium text-green-800 mb-2">
                    2. Income Earned for 30 Years
                    {hasOriginalValues && form.originalMonthlyRent && (
                      <span className="text-xs text-blue-600 font-normal ml-2">🕰️ Using original rent</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-900">
                    <div>Monthly Rent:</div>
                    <div className="text-right">{Money(monthlyRent)}</div>
                    <div>Less Vacancy ({vacancyPctRent}%):</div>
                    <div className="text-right">-{Money(monthlyRent * (vacancyPctRent / 100))}</div>
                    <div>Effective Monthly Rent:</div>
                    <div className="text-right">{Money(effectiveMonthlyRent)}</div>
                    <div className="font-medium border-t pt-1">Total 30-Year Income:</div>
                    <div className="text-right font-medium border-t pt-1">{Money(incomeEarnedFor30y)}</div>
                  </div>
                </div>
                
                {/* Step 3: Total Value */}
                <div className="bg-white border rounded p-3 text-gray-900">
                  <div className="font-medium text-purple-800 mb-2">3. Total Value</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Purchase Price:</div>
                    <div className="text-right">{Money(purchasePrice)}</div>
                    <div>Plus 30-Year Income:</div>
                    <div className="text-right">{Money(incomeEarnedFor30y)}</div>
                    <div className="font-medium border-t pt-1">Total Value:</div>
                    <div className="text-right font-medium border-t pt-1">{Money(totalValue)}</div>
                  </div>
                </div>
                
                {/* Step 4: Total Expenses */}
                <div className="bg-white border rounded p-3 text-gray-900">
                  <div className="font-medium text-red-800 mb-2">
                    4. Total Expenses (30 Years)
                    {hasOriginalValues && (
                      <span className="text-xs text-blue-600 font-normal ml-2">🕰️ Using original rates</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>Initial Amount Paid:</div>
                    <div className="text-right">{Money(amountPaid)}</div>
                    <div>Management ({mgmtPctRent}% × rent):</div>
                    <div className="text-right">{Money(totalManagement)}</div>
                    <div>Mortgage Payments{originalMortgagePayment > 0 ? ' (original terms)' : mortgageFree ? ' (theoretical)' : ''}:</div>
                    <div className="text-right">{Money(totalMortgagePayments)}</div>
                    <div>Property Taxes{hasOriginalValues && form.originalPropertyTaxPct ? ' (orig %)' : ''}:</div>
                    <div className="text-right">{Money(totalPropertyTaxes)}</div>
                    <div>Maintenance ({maintPctRent}% × rent):</div>
                    <div className="text-right">{Money(totalMaintenanceExpenses)}</div>
                    <div>Insurance{hasOriginalValues && form.originalInsuranceMonthly ? ' (orig)' : ''}:</div>
                    <div className="text-right">{Money(totalInsurance)}</div>
                    {totalHOA > 0 && (
                      <>
                        <div>HOA Fees:</div>
                        <div className="text-right">{Money(totalHOA)}</div>
                      </>
                    )}
                    <div>Income Tax (44%):</div>
                    <div className="text-right">{Money(totalIncomeTax)}</div>
                    <div className="font-medium border-t pt-1">Total Expenses:</div>
                    <div className="text-right font-medium border-t pt-1">{Money(totalExpenses)}</div>
                  </div>
                </div>
                
                {/* Step 5: Final Calculation */}
                <div className="bg-teal-100 border border-teal-300 rounded p-3">
                  <div className="font-medium text-teal-900 mb-2">5. Final 30y ATROI Calculation</div>
                     <div className="bg-white border rounded p-3 text-gray-900">
                    <div>Net Value (Total Value - Total Expenses):</div>
                    <div className="text-right">{Money(netValue)}</div>
                    <div>÷ Amount Paid:</div>
                    <div className="text-right">÷ {Money(amountPaid)}</div>
                    <div>÷ 30 years:</div>
                    <div className="text-right">÷ 30</div>
                    <div className="font-bold border-t pt-1 text-base">30y ATROI Result:</div>
                    <div className="text-right font-bold border-t pt-1 text-lg text-teal-900">{atROI.toFixed(2)}%</div>
                  </div>
                </div>
                
                <div className="text-xs text-gray-600 mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                  <strong>Note:</strong> This 30yATROI calculation always includes 30 years of mortgage payments (even for cash purchases) to standardize comparisons. If you expect ~13%, check if any input values differ from your original calculation.
                </div>
              </>
            );
          })()}
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
          {(Number(form.closingCosts) > 0) && (
            <div className="flex justify-between">
              <span>Closing Costs:</span>
              <span>{Money(form.closingCosts || 0)}</span>
            </div>
          )}
          {(Number(form.repairCosts) > 0) && (
            <div className="flex justify-between">
              <span>Repair Costs:</span>
              <span>{Money(form.repairCosts || 0)}</span>
            </div>
          )}
          {(Number(form.initialInvestment) > 0) && (
            <div className="flex justify-between">
              <span>Other Investment:</span>
              <span>{Money(form.initialInvestment || 0)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1">
            <span className="font-medium">Total Cash Investment:</span>
            <span className="font-medium">{Money(metrics.down + (Number(form.closingCosts) || 0) + (Number(form.repairCosts) || 0) + (Number(form.initialInvestment) || 0))}</span>
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
    teal: 'bg-teal-100 text-teal-900 border-teal-300',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200'
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-gray-600 mt-1">{description}</div>
    </div>
  );
}
