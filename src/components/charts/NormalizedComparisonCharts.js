import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { calculateEquityAtYear, analyzeWithCurrentValues } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';
import { mergePropertiesAndScenarios } from '@/lib/scenarioHelpers';

export default function NormalizedComparisonCharts({ properties = [], scenarios = [] }) {
  const [timeRange, setTimeRange] = useState('all');
  const [showUnpurchased, setShowUnpurchased] = useState(true);
  const [projectionYears, setProjectionYears] = useState('5y');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showCashPurchase, setShowCashPurchase] = useState(false);

  // Merge properties and scenarios into combined list for processing
  const allProperties = useMemo(() => mergePropertiesAndScenarios(properties, scenarios, showCashPurchase), [properties, scenarios, showCashPurchase]);

  // Visibility state for properties
  const [visibleProperties, setVisibleProperties] = useState(() => {
    const initial = {};
    allProperties.forEach(item => {
      initial[item.id] = true;
    });
    return initial;
  });

  // Update visibility when properties change
  useEffect(() => {
    setVisibleProperties(prev => {
      const updated = { ...prev };
      allProperties.forEach(item => {
        if (!(item.id in updated)) {
          updated[item.id] = true;
        }
      });
      return updated;
    });
  }, [allProperties]);

  // Generate normalized chart data
  const generateNormalizedData = (metric) => {
    const currentYear = 2025;
    let startYear;
    
    switch (timeRange) {
      case 'now': startYear = currentYear; break;
      case '2y': startYear = currentYear - 2; break;
      case '5y': startYear = currentYear - 5; break;
      case 'all': startYear = 2012; break;
      default: startYear = currentYear - 10; break;
    }

    const projectionExtension = projectionYears === '10y' ? 10 : 5;
    const endYear = currentYear + projectionExtension;

    const years = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }

    // First pass: collect all data points
    const rawData = years.map(year => {
      const dataPoint = { year };

      allProperties.forEach(property => {
        if (!visibleProperties[property.id]) return;
        const isPurchased = Boolean(property.purchased);
        if (!isPurchased && !showUnpurchased) return;

        const displayLabel = getPropertyDisplayLabel(property);
        const purchaseYear = property.year_purchased || currentYear;
        const startYear = isPurchased ? purchaseYear : currentYear;
        
        if (year >= startYear) {
          const purchasePrice = Number(property.purchase_price) || 0;
          const currentValue = Number(property.current_market_value) || purchasePrice;

          // Calculate property value for this year
          let propertyValue;
          if (isPurchased) {
            const yearsOwned = year - purchaseYear;
            const totalYearsOwned = Math.max(1, currentYear - purchaseYear);
            
            if (year === currentYear) {
              propertyValue = currentValue;
            } else if (year < currentYear) {
              // Historical data - use actual appreciation rate interpolation
              if (yearsOwned <= 0) {
                propertyValue = purchasePrice;
              } else {
                const appreciationRate = (currentValue - purchasePrice) / purchasePrice;
                const yearlyAppreciation = appreciationRate / totalYearsOwned;
                propertyValue = purchasePrice * (1 + yearlyAppreciation * yearsOwned);
              }
            } else {
              // Future projection - use 3% appreciation from current value
              const yearsSinceNow = year - currentYear;
              const assumedAppreciationRate = 0.03;
              propertyValue = currentValue * Math.pow(1 + assumedAppreciationRate, yearsSinceNow);
            }
          } else {
            // Unpurchased property - project from current year with 3% appreciation
            const yearsSinceNow = year - currentYear;
            const assumedAppreciationRate = 0.03;
            propertyValue = currentValue * Math.pow(1 + assumedAppreciationRate, yearsSinceNow);
          }

          // Calculate equity with cash flow acceleration
          let equity = 0;
          let acceleratedMortgageBalance = 0;
          
          if (propertyValue > 0) {
            if (isPurchased) {
              try {
                // Start with standard equity calculation
                equity = calculateEquityAtYear(property, year, propertyValue);
                
                // Calculate cash flow impact on mortgage paydown
                const yearsFromPurchase = Math.max(0, year - purchaseYear);
                if (yearsFromPurchase > 0 && !property.mortgage_free) {
                  const metrics = analyzeWithCurrentValues(property);
                  const annualNOI = metrics.noiAnnual || 0;
                  const monthlyMortgagePayment = metrics.pAndI || 0;
                  const annualMortgagePayment = monthlyMortgagePayment * 12;
                  const annualNetCashFlow = annualNOI - annualMortgagePayment;
                  
                  // If positive cash flow, reinvest 80% (40% mortgage paydown + 40% improvements), retain 20% cash
                  if (annualNetCashFlow > 0) {
                    const mortgageAccelerationPct = 0.4; // 40% for extra mortgage payments
                    const improvementReinvestmentPct = 0.4; // 40% for property improvements
                    // Remaining 20% retained as cash (calculated separately below)
                    
                    // Extra mortgage payments
                    const annualExtraPayment = annualNetCashFlow * mortgageAccelerationPct;
                    const totalExtraPayments = annualExtraPayment * yearsFromPurchase;
                    
                    // Reduce mortgage balance by extra payments
                    const standardEquity = calculateEquityAtYear(property, year, propertyValue);
                    const standardMortgageBalance = propertyValue - standardEquity;
                    acceleratedMortgageBalance = Math.max(0, standardMortgageBalance - totalExtraPayments);
                    
                    // Property improvements increase property value
                    const totalImprovements = (annualNetCashFlow * improvementReinvestmentPct) * yearsFromPurchase;
                    propertyValue += totalImprovements;
                    
                    // Final equity = improved property value - accelerated mortgage balance
                    equity = propertyValue - acceleratedMortgageBalance;
                  }
                }
                
                if (!Number.isFinite(equity) || equity < 0) {
                  equity = Math.max(0, propertyValue * 0.2);
                }
              } catch {
                equity = Math.max(0, propertyValue * 0.2);
              }
            } else {
              const downPaymentPct = (Number(property.down_payment_pct) || 20) / 100;
              equity = propertyValue * downPaymentPct;
            }
          }

          // Calculate cumulative cash retained (cash not reinvested into property)
          const yearsOfIncome = isPurchased ? Math.max(0, year - purchaseYear) : Math.max(0, year - currentYear);
          let cumulativeRetainedCash = 0;
          
          if (yearsOfIncome > 0) {
            const metrics = analyzeWithCurrentValues(property);
            const annualNOI = metrics.noiAnnual || 0;
            let annualNetCashFlow = annualNOI;
            
            if (isPurchased && !property.mortgage_free) {
              const monthlyMortgagePayment = metrics.pAndI || 0;
              const annualMortgagePayment = monthlyMortgagePayment * 12;
              annualNetCashFlow = annualNOI - annualMortgagePayment;
              
              // If positive cash flow, assume some percentage is retained as cash (not reinvested)
              // For demonstration, let's say 20% is retained, 80% reinvested into equity
              if (annualNetCashFlow > 0) {
                const retainedCashPercentage = 0.2; // 20% retained as cash
                annualNetCashFlow = annualNetCashFlow * retainedCashPercentage;
              }
              // If negative cash flow, all of it reduces retained cash
            }
            
            cumulativeRetainedCash = annualNetCashFlow * yearsOfIncome;
          }

          if (metric === 'equity') {
            dataPoint[`${displayLabel}_value`] = equity;
          } else {
            dataPoint[`${displayLabel}_value`] = equity + cumulativeRetainedCash;
          }
        }
      });

      return dataPoint;
    });

    // Second pass: normalize each property's data to start at 1.0
    const normalizedData = rawData.map(dataPoint => {
      const normalized = { year: dataPoint.year };

      allProperties.forEach(property => {
        if (!visibleProperties[property.id]) return;
        const isPurchased = Boolean(property.purchased);
        if (!isPurchased && !showUnpurchased) return;

        const displayLabel = getPropertyDisplayLabel(property);
        const valueKey = `${displayLabel}_value`;
        
        if (dataPoint[valueKey] !== undefined) {
          // Find the first non-zero value for this property to use as baseline
          const firstValue = rawData.find(point => point[valueKey] && point[valueKey] > 0)?.[valueKey];
          
          if (firstValue && firstValue > 0) {
            normalized[`${displayLabel}_normalized`] = dataPoint[valueKey] / firstValue;
          }
        }
      });

      return normalized;
    });

    return normalizedData;
  };

  const equityData = useMemo(() => generateNormalizedData('equity'), [allProperties, timeRange, visibleProperties, showUnpurchased, projectionYears, refreshKey]);
  const equityCashData = useMemo(() => generateNormalizedData('equity_cash'), [allProperties, timeRange, visibleProperties, showUnpurchased, projectionYears, refreshKey]);

  const toggleProperty = (propertyId) => {
    setVisibleProperties(prev => ({
      ...prev,
      [propertyId]: !prev[propertyId]
    }));
  };

  const refreshCharts = () => {
    setRefreshKey(prev => prev + 1);
  };

  const colors = ['#8884d8', '#82ca9d', '#a82222', '#ff7300', '#00ff00', '#ff00ff'];

  const renderChart = (data, title, yAxisLabel) => (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="text-md font-semibold text-gray-600">{title}</h4>
        <div className="text-xs text-gray-500">
          Normalized to 1.0 at start
        </div>
      </div>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis 
              domain={[1.0, 'dataMax']}
              tickFormatter={(value) => `${value.toFixed(1)}x`}
            />
            <Tooltip 
              formatter={(value, name) => [`${value.toFixed(2)}x`, name]}
              labelFormatter={(year) => `Year: ${year}`}
            />
            <Legend />
            
            {allProperties
              .filter(property => {
                if (!visibleProperties[property.id]) return false;
                const isPurchased = Boolean(property.purchased);
                return isPurchased || showUnpurchased;
              })
              .map((property, index) => {
                const color = colors[index % colors.length];
                const displayLabel = getPropertyDisplayLabel(property);
                const isPurchased = Boolean(property.purchased);
                const downPaymentPct = Number(property.down_payment_pct) || 20;
                const isMortgageFree = property.mortgage_free || 
                  (property.current_mortgage_balance !== null && 
                   property.current_mortgage_balance !== undefined && 
                   property.current_mortgage_balance !== '' && 
                   Number(property.current_mortgage_balance) === 0);
                
                return (
                  <Line
                    key={property.id}
                    type="monotone"
                    dataKey={`${displayLabel}_normalized`}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={isPurchased ? "0" : "8 4"}
                    name={`${displayLabel} (${isMortgageFree ? 'Owned' : `${downPaymentPct}%dp`})${isPurchased ? '' : ' (prj)'}`}
                    connectNulls={false}
                  />
                );
              })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-gray-600">Normalized Growth Comparison</h3>
            <button
              onClick={refreshCharts}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
              title="Refresh charts"
            >
              <span>🔄</span>
              <span>Refresh</span>
            </button>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Time Range Selector */}
            <div className="flex gap-1">
              {['now', '2y', '5y', '10y', 'all'].map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-2 py-1 text-xs rounded ${
                    timeRange === range
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {range}
                </button>
              ))}
            </div>

            {/* Show Unpurchased Toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showUnpurchased}
                onChange={(e) => setShowUnpurchased(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-600">Show Unpurchased</span>
            </label>

            {/* Cash Purchase Scenarios Toggle */}
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showCashPurchase}
                onChange={(e) => setShowCashPurchase(e.target.checked)}
                className="rounded"
              />
              <span className="text-gray-600">Cash Purchase Scenarios</span>
            </label>

            {/* Property Toggles */}
            <div className="flex flex-wrap gap-2">
              {allProperties.map((property, index) => {
                const isPurchased = Boolean(property.purchased);
                const isCashPurchase = property.isCashPurchaseScenario;
                if (!isPurchased && !showUnpurchased) return null;
                const downPaymentPct = Number(property.down_payment_pct) || 20;
                const isMortgageFree = property.mortgage_free || 
                  (property.current_mortgage_balance !== null && 
                   property.current_mortgage_balance !== undefined && 
                   property.current_mortgage_balance !== '' && 
                   Number(property.current_mortgage_balance) === 0);
                
                return (
                  <button
                    key={property.id}
                    onClick={() => toggleProperty(property.id)}
                    className={`px-2 py-1 text-xs rounded ${
                      visibleProperties[property.id]
                        ? (isPurchased 
                            ? 'bg-blue-100 text-blue-800' 
                            : isCashPurchase 
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-orange-100 text-orange-800')
                        : 'bg-gray-100 text-gray-500'
                    }`}
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftStyle: 'solid',
                      borderLeftColor: colors[index % colors.length]
                    }}
                  >
                    {getPropertyDisplayLabel(property)} ({isMortgageFree ? 'Owned' : `${downPaymentPct}%`}){!isPurchased ? (isCashPurchase ? ' 💰' : ' 📊') : ''}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Full-width Charts */}
      <div className="space-y-6">
        {renderChart(equityData, "Normalized Equity Growth", "Growth Multiple")}
        {renderChart(equityCashData, "Normalized Equity + Cash Growth", "Growth Multiple")}
      </div>
    </div>
  );
}