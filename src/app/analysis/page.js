'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import AssetValueChart from '@/components/charts/AssetValueChart';
import NormalizedComparisonCharts from '@/components/charts/NormalizedComparisonCharts';
import PerformanceMetricsChart from '@/components/charts/PerformanceMetricsChart';
import AnnualIncomeChart from '@/components/charts/AnnualIncomeChart';
import MetricsGrid from '@/components/ui/MetricsGrid';
import PropertySelector from '@/components/ui/PropertySelector';
import ScenarioSelector from '@/components/ui/ScenarioSelector';
import PageHeader from '@/components/ui/PageHeader';
import { analyzeWithCurrentValues, calculateCAGR, calculateHoldVsSell } from '@/lib/finance';
import { calculateMarketInvestmentValue } from '@/lib/marketData';

function AnalysisContent() {
  const searchParams = useSearchParams();
  const [properties, setProperties] = useState([]);
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [selectedScenarios, setSelectedScenarios] = useState([]);
  const [timeRange] = useState('5y'); // 2y, 5y, 10y
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    const propertyId = searchParams.get('property');
    if (propertyId && properties.length > 0) {
      const property = properties.find(p => p.id === parseInt(propertyId));
      if (property) {
        // Use functional update to avoid dependency on selectedProperties
        setSelectedProperties(prev => {
          if (!prev.find(p => p.id === property.id)) {
            return [property];
          }
          return prev;
        });
      }
    }
  }, [searchParams, properties]);

  async function loadProperties() {
    try {
      const res = await fetch('/api/properties', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
        // Default to first 3 properties for initial view
        setSelectedProperties(data.slice(0, 3));
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  }

  const togglePropertySelection = (property) => {
    setSelectedProperties(prev => {
      const isSelected = prev.some(p => p.id === property.id);
      if (isSelected) {
        return prev.filter(p => p.id !== property.id);
      } else {
        return [...prev, property];
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading analysis...</div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <PageHeader 
        title="Investment Analysis"
        subtitle="Performance charts, projections, and market comparisons"
        currentPage="/analysis"
      />

      {/* Property Selection */}
      <PropertySelector 
        properties={properties}
        selectedProperties={selectedProperties}
        onToggleProperty={togglePropertySelection}
      />

      {/* Scenario Selection */}
      <ScenarioSelector 
        onScenariosChange={setSelectedScenarios}
      />

      {/* Key Metrics Grid */}
      <MetricsGrid 
        properties={selectedProperties}
        timeRange={timeRange}
      />

      {/* Performance Charts */}
      <div className="space-y-8">
        <AssetValueChart 
          properties={selectedProperties}
          scenarios={selectedScenarios}
        />
        
        <NormalizedComparisonCharts 
          properties={selectedProperties}
          scenarios={selectedScenarios}
        />
        
        <PerformanceMetricsChart 
          properties={selectedProperties}
          scenarios={selectedScenarios}
        />
        
        <AnnualIncomeChart 
          properties={selectedProperties}
          scenarios={selectedScenarios}
        />
      </div>

      {/* Detailed Analysis Table */}
      <DetailedAnalysisTable 
        properties={selectedProperties}
        timeRange={timeRange}
      />
    </main>
  );
}

function DetailedAnalysisTable({ properties }) {
  return (
    <section className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-600">Advanced Investment Analysis</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 text-gray-900 font-semibold">Property</th>
              <th className="text-right p-2 text-gray-900 font-semibold">Mkt Value</th>
              <th className="text-right p-3 text-gray-900 font-semibold">Annual NOI</th>
              <th className="text-right p-3 text-gray-900 font-semibold">Mkt Cap</th>
              <th className="text-right p-3 text-gray-900 font-semibold">Purch Cap</th>
              <th className="text-right p-3 text-gray-900 font-semibold">CoC</th>
              <th className="text-right p-3 text-gray-900 font-semibold">CAGR</th>
              <th className="text-right p-3 text-gray-900 font-semibold">vs S&P 500</th>
              <th className="text-right p-3 text-gray-900 font-semibold">S&P 500 Value</th>
              <th className="text-right p-3 text-gray-900 font-semibold">Cash-on-Equity</th>
            </tr>
          </thead>
          <tbody>
            {properties.map(property => {
              const metrics = analyzeWithCurrentValues(property);
              const currentValue = property.current_market_value || property.purchase_price;
              const yearsOwned = property.year_purchased ? 2025 - property.year_purchased : 1;
              
              // Real S&P 500 comparison using actual down payment invested
              // Use down payment calculation, fallback to initial_investment if reasonable
              const downPayment = Number(property.purchase_price) * (Number(property.down_payment_pct) || 20) / 100;
              const initialInvestment = (property.initial_investment && Number(property.initial_investment) < Number(property.purchase_price) && Number(property.initial_investment) > 0) ? 
                Number(property.initial_investment) : downPayment;
              
              // Calculate CAGR on actual investment (down payment to current equity)
              const currentEquityValue = (Number(property.current_market_value) || Number(property.purchase_price)) - 
                (Number(property.current_mortgage_balance) || 0);
              const appreciationCAGR = property.current_market_value ? 
                calculateCAGR(initialInvestment, currentEquityValue, yearsOwned) : null;
              
              
              const marketComparison = (property.purchased && property.year_purchased && initialInvestment > 0 && initialInvestment < 10000000) ? 
                calculateMarketInvestmentValue(initialInvestment, property.year_purchased, property.month_purchased || 1) : null;
              
              // Property total value (current value + all cash flows received)
              const propertyTotalValue = (Number(property.current_market_value) || Number(property.purchase_price)) + 
                (metrics.cashflowMonthly * 12 * yearsOwned); // Simplified cash flow total
              
              // Hold vs Sell analysis
              const holdVsSell = calculateHoldVsSell(property);
              
              // Market cap rate (NOI / current market value)
              const marketCapRate = currentValue > 0 ? (metrics.noiAnnual / currentValue) * 100 : 0;
              
              return (
                <tr key={property.id} className="border-b hover:bg-gray-50">
                  <td className="p-3">
                    <div className="font-medium text-gray-900">{property.address}</div>
                    <div className="text-xs text-gray-500">{property.city}, {property.state}</div>
                  </td>
                  <td className="p-2 text-right">
                    <div className="font-medium text-gray-600">${Math.round(currentValue / 1000)}K</div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-medium text-green-600">${Math.round(metrics.noiAnnual).toLocaleString()}</div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-medium text-gray-600">{marketCapRate.toFixed(2)}%</div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-medium text-gray-600">{metrics.metrics.capRate.toFixed(2)}%</div>
                  </td>
                  <td className="p-3 text-right">
                    <div className="font-medium text-blue-600">{metrics.metrics.cashOnCash.toFixed(2)}%</div>
                  </td>
                  <td className="p-3 text-right">
                    {appreciationCAGR !== null ? (
                      <div className={`font-medium ${appreciationCAGR >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {appreciationCAGR.toFixed(1)}%
                      </div>
                    ) : (
                      <div className="text-gray-400">N/A</div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {marketComparison ? (
                      <div className={`font-medium ${appreciationCAGR >= marketComparison.annualizedReturn ? 'text-green-600' : 'text-red-600'}`}>
                        {appreciationCAGR >= marketComparison.annualizedReturn ? '+' : ''}{(appreciationCAGR - marketComparison.annualizedReturn).toFixed(1)}%
                      </div>
                    ) : (
                      <div className="text-gray-400">N/A</div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    {marketComparison ? (
                      <div className="font-medium text-gray-600">
                        <div>${marketComparison.marketValue.toFixed(0).toLocaleString()}</div>
                        <div className="text-xs text-gray-500">
                          vs ${propertyTotalValue.toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-400">N/A</div>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className={`font-medium ${holdVsSell.currentCashOnEquity >= 10 ? 'text-green-600' : holdVsSell.currentCashOnEquity >= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {holdVsSell.currentCashOnEquity.toFixed(1)}%
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      
      <div className="mt-4 text-xs text-gray-600 space-y-1">
        <div><strong>Market Cap Rate:</strong> NOI ÷ Current Market Value (what you&apos;re earning on the asset today)</div>
        <div><strong>Purchase Cap Rate:</strong> NOI ÷ Original Purchase Price (return on total property value)</div>
        <div><strong>Cash-on-Cash:</strong> NOI ÷ Initial Cash Investment (return on actual cash you invested, excludes appreciation)</div>
        <div><strong>CAGR:</strong> Compound Annual Growth Rate from initial investment to current equity value (includes property appreciation, excludes cash flow)</div>
        <div><strong>vs S&P 500:</strong> How your appreciation compares to actual S&P 500 returns from purchase date</div>
        <div><strong>S&P 500 Value:</strong> What your initial investment would be worth in S&P 500 today vs property total value</div>
        <div><strong>Property Total Value (vs number):</strong> Current market value + estimated total cash flows received over years owned</div>
        <div><strong>Cash-on-Equity:</strong> Annual cash flow ÷ Current equity (opportunity cost analysis)</div>
        <div><strong>Hold/Sell Formula:</strong> Compares Cash-on-Equity vs 10% market return. Gap = Market Return (10%) - Cash-on-Equity. Recommendations: Hold (gap &lt;=2%), Review (gap 2-5%), Consider Selling (gap &gt;5%)</div>
      </div>
    </section>
  );
}

export default function Analysis() {
  useEffect(() => {
    document.title = 'PI Analysis';
  }, []);

  // Also set title immediately for new tabs
  if (typeof window !== 'undefined') {
    document.title = 'PI Analysis';
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AnalysisContent />
    </Suspense>
  );
}