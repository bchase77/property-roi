import React from 'react';
import { analyze } from '@/lib/finance';
import PropertyChart from '../PropertyChart';

export default function FinancialPreview({ form }) {
  const metrics = analyze({
    purchasePrice: Number(form.purchasePrice) || 0,
    downPct: Number(form.downPct) || 0,
    rateApr: Number(form.rateApr) || 0,
    years: Number(form.years) || 0,
    monthlyRent: Number(form.monthlyRent) || 0,
    taxPct: Number(form.taxPct) || 0,
    hoaMonthly: Number(form.hoaMonthly) || 0,
    insuranceMonthly: Number(form.insuranceMonthly) || 0,
    maintPctRent: Number(form.maintPctRent) || 0,
    vacancyPctRent: Number(form.vacancyPctRent) || 0,
    mgmtPctRent: Number(form.mgmtPctRent) || 0,
    otherMonthly: Number(form.otherMonthly) || 0,
    initialInvestment: Number(form.initialInvestment) || 0,
    mortgageFree: Boolean(form.mortgageFree)
  });

  const Money = (v) => `$${Number(v).toLocaleString()}`;
  const Pct = (v) => `${Number(v).toFixed(2)}%`;

  // Sample chart data - in real app this would be projections
  const chartData = [
    { year: new Date().getFullYear() - 2, value: (form.purchasePrice || 0) * 0.95 },
    { year: new Date().getFullYear() - 1, value: (form.purchasePrice || 0) * 0.98 },
    { year: new Date().getFullYear(), value: form.purchasePrice || 0 },
    { year: new Date().getFullYear() + 1, value: (form.purchasePrice || 0) * 1.03 },
    { year: new Date().getFullYear() + 2, value: (form.purchasePrice || 0) * 1.06 }
  ];

  return (
    <div className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4">Financial Analysis</h2>
      
      {/* Property Chart */}
      {form.purchasePrice && (
        <div className="mb-6">
          <PropertyChart data={chartData} />
        </div>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <MetricCard 
          label="Cap Rate" 
          value={Pct(metrics.metrics.capRate)}
          description="Annual NOI / Purchase Price"
          color="blue"
        />
        <MetricCard 
          label="Cash-on-Cash" 
          value={Pct(metrics.metrics.cashOnCash)}
          description="Annual Cash Flow / Cash Invested"
          color="green"
        />
        <MetricCard 
          label="DSCR" 
          value={form.mortgageFree ? 'N/A' : metrics.metrics.dscr.toFixed(2)}
          description="NOI / Debt Service"
          color="purple"
        />
        <MetricCard 
          label="Gross Yield" 
          value={Pct(metrics.metrics.grossYield)}
          description="Annual Rent / Purchase Price"
          color="orange"
        />
      </div>

      {/* Cash Flow Breakdown */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-900">Monthly Cash Flow</h3>
        
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Gross Rent:</span>
            <span className="text-green-600">{Money(form.monthlyRent || 0)}</span>
          </div>
          
          <div className="flex justify-between text-gray-600">
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
            <div className="flex justify-between font-medium">
              <span>Net Operating Income:</span>
              <span className={metrics.noiMonthly >= 0 ? 'text-green-600' : 'text-red-600'}>
                {Money(metrics.noiMonthly)}
              </span>
            </div>
          </div>

          {!form.mortgageFree && (
            <div className="flex justify-between text-gray-600">
              <span>Mortgage Payment (P&I):</span>
              <span className="text-red-600">-{Money(metrics.pAndI)}</span>
            </div>
          )}

          <div className="border-t pt-2">
            <div className="flex justify-between font-semibold text-lg">
              <span>Cash Flow:</span>
              <span className={metrics.cashflowMonthly >= 0 ? 'text-green-600' : 'text-red-600'}>
                {Money(metrics.cashflowMonthly)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Investment Summary */}
      <div className="mt-6 pt-4 border-t">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Investment Summary</h3>
        <div className="space-y-1 text-sm">
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
    orange: 'bg-orange-50 text-orange-700 border-orange-200'
  };

  return (
    <div className={`rounded-lg border p-3 ${colorClasses[color]}`}>
      <div className="text-xs opacity-75 mb-1">{label}</div>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs opacity-75 mt-1">{description}</div>
    </div>
  );
}