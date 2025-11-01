import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { analyzeWithCurrentValues, calculateEquityAtYear } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';
import { getAnnualZHVI } from '@/lib/zhviData';
import { projectRent, createPayoffScenarios, calculateProjectedMetrics } from '@/lib/rentProjections';
import { mergePropertiesAndScenarios } from '@/lib/scenarioHelpers';

export default function AssetValueChart({ properties, scenarios = [] }) {
  // Merge properties and scenarios into a single array for processing
  const allItems = mergePropertiesAndScenarios(properties, scenarios);
  const [visibleProperties, setVisibleProperties] = useState(
    allItems.reduce((acc, item) => ({ ...acc, [item.id]: true }), {})
  );

  // Update visibility state when properties or scenarios change
  useEffect(() => {
    setVisibleProperties(prev => {
      const newVisibility = allItems.reduce((acc, item) => ({ ...acc, [item.id]: true }), {});
      // Only update if the visibility actually changed
      if (JSON.stringify(prev) !== JSON.stringify(newVisibility)) {
        return newVisibility;
      }
      return prev;
    });
  }, [allItems]);
  const [timeRange, setTimeRange] = useState('10y');
  const [historicalData, setHistoricalData] = useState({});
  const [visibleMarkets, setVisibleMarkets] = useState({
    'DFW, TX': false,
    'Memphis, TN': false
  });
  const [viewMode, setViewMode] = useState('market'); // 'market' or 'equity'
  const [showProjections, setShowProjections] = useState(false);
  const [selectedPayoffScenario, setSelectedPayoffScenario] = useState('current');
  const [rentAnalysis, setRentAnalysis] = useState({});

  // Fetch historical actuals data
  useEffect(() => {
    if (properties.length === 0) return;
    
    const fetchHistoricalData = async () => {
      try {
        const propertyIds = properties.map(p => p.id).join(',');
        const response = await fetch(`/api/properties/actuals?ids=${propertyIds}`);
        
        if (response.ok) {
          const data = await response.json();
          setHistoricalData(data);
        }
      } catch (error) {
        console.error('Failed to fetch historical data:', error);
      }
    };
    
    fetchHistoricalData();
  }, [properties]);

  // Fetch rent analysis data
  useEffect(() => {
    const fetchRentAnalysis = async () => {
      try {
        const response = await fetch('/api/rent-analysis');
        if (response.ok) {
          const data = await response.json();
          setRentAnalysis(data.analysis || {});
        }
      } catch (error) {
        console.error('Failed to fetch rent analysis:', error);
      }
    };
    
    fetchRentAnalysis();
  }, []);

  const toggleProperty = (propertyId) => {
    setVisibleProperties(prev => ({
      ...prev,
      [propertyId]: !prev[propertyId]
    }));
  };

  const toggleMarket = (market) => {
    setVisibleMarkets(prev => ({
      ...prev,
      [market]: !prev[market]
    }));
  };

  // Generate historical data points using real data
  const generateChartData = useCallback(() => {
    // Use a consistent year to avoid hydration mismatches
    const currentYear = 2025;
    let startYear, endYear;
    
    if (timeRange === 'all') {
      startYear = 2012;
    } else {
      const yearsBack = timeRange === '2y' ? 2 : timeRange === '5y' ? 5 : 10;
      startYear = currentYear - yearsBack;
    }
    
    // Extend to include projections if enabled
    endYear = showProjections ? currentYear + 5 : currentYear;
    
    const years = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }

    return years.map(year => {
      const dataPoint = { year };
      
      allItems.forEach(property => {
        if (!visibleProperties[property.id]) return;
        
        const isProjectionYear = year > currentYear;
        const propertyHistoricalData = historicalData[property.id] || [];
        const yearData = propertyHistoricalData.find(d => d.year === year);
        // For purchased properties, use actual ownership timeline
        // For unpurchased properties, treat current year as purchase year for projections
        const effectivePurchaseYear = property.year_purchased || currentYear;
        const yearsOwned = year - effectivePurchaseYear;
        
        // Show data for owned years and projections
        if (yearsOwned >= 0 || (showProjections && year > currentYear)) {
          const purchasePrice = Number(property.purchase_price) || 0;
          const currentValue = Number(property.current_market_value) || purchasePrice;
          
          // Use real Zillow values when available, interpolate for missing years
          let propertyValue;
          
          if (year <= effectivePurchaseYear) {
            propertyValue = purchasePrice;
          } else {
            // Check if we have Zillow data for this year
            if (yearData && yearData.zillowValue) {
              propertyValue = yearData.zillowValue;
            } else {
              // Find surrounding Zillow values for interpolation
              const allHistoricalData = historicalData[property.id] || [];
              const zillowData = allHistoricalData.filter(d => d.zillowValue).sort((a, b) => a.year - b.year);
              
              if (zillowData.length === 0) {
                // No Zillow data, fall back to linear interpolation
                const totalYearsOwned = currentYear - effectivePurchaseYear;
                const progressRatio = totalYearsOwned > 0 ? (year - effectivePurchaseYear) / totalYearsOwned : 0;
                propertyValue = purchasePrice + (currentValue - purchasePrice) * Math.max(0, Math.min(progressRatio, 1));
              } else {
                // Find closest Zillow values before and after this year
                const beforeData = zillowData.filter(d => d.year <= year).pop();
                const afterData = zillowData.find(d => d.year > year);
                
                if (beforeData && afterData) {
                  // Interpolate between known Zillow values
                  const yearsDiff = afterData.year - beforeData.year;
                  const progressRatio = (year - beforeData.year) / yearsDiff;
                  propertyValue = beforeData.zillowValue + (afterData.zillowValue - beforeData.zillowValue) * progressRatio;
                } else if (beforeData) {
                  // Use the most recent Zillow value
                  propertyValue = beforeData.zillowValue;
                } else if (afterData) {
                  // Use the earliest Zillow value
                  propertyValue = afterData.zillowValue;
                }
              }
            }
          }
          
          // Handle projections for future years
          if (isProjectionYear && showProjections) {
            // Project property value with 3% annual appreciation (conservative)
            const yearsFromNow = year - currentYear;
            const appreciationRate = 0.03;
            propertyValue = currentValue * Math.pow(1 + appreciationRate, yearsFromNow);
          }
          
          // Calculate cumulative income through this year
          let cumulativeIncome = 0;
          const allHistoricalData = historicalData[property.id] || [];
          
          // Calculate cumulative income from effective purchase year
          for (let incomeYear = effectivePurchaseYear; incomeYear <= year; incomeYear++) {
            if (incomeYear <= currentYear) {
              // Historical data
              const incomeYearData = allHistoricalData.find(d => d.year === incomeYear);
              if (incomeYearData) {
                // Calculate NOI by excluding depreciation from total expenses
                // NOI = grossIncome - (totalExpenses - depreciation)
                const noi = incomeYearData.grossIncome - (incomeYearData.totalExpenses - (incomeYearData.depreciation || 0));
                cumulativeIncome += noi;
              } else if (incomeYear >= effectivePurchaseYear) {
                // Estimate income for missing years
                const metrics = analyzeWithCurrentValues(property);
                const estimatedAnnualIncome = metrics.noiAnnual;
                cumulativeIncome += estimatedAnnualIncome;
              }
            } else if (showProjections) {
              // Projected income with rent increases
              const currentRent = Number(property.current_rent_monthly || property.monthly_rent) || 0;
              const stateData = rentAnalysis[property.state];
              const rentProjections = projectRent(currentRent, property.state, stateData);
              
              const projectionIndex = incomeYear - currentYear - 1;
              const projectedRent = rentProjections[projectionIndex]?.projectedRent || currentRent;
              
              // Project NOI with rent increase but expenses growing at inflation (2%)
              const metrics = analyzeWithCurrentValues(property);
              const currentNOI = metrics.noiAnnual;
              const currentGrossRent = currentRent * 12;
              const currentExpenses = currentGrossRent - currentNOI;
              
              const projectedGrossRent = projectedRent * 12;
              const inflationRate = 0.02;
              const projectedExpenses = currentExpenses * Math.pow(1 + inflationRate, incomeYear - currentYear);
              const projectedNOI = projectedGrossRent - projectedExpenses;
              
              cumulativeIncome += projectedNOI;
            }
          }
          
          // Calculate equity for this year with payoff scenarios
          let equity = 0;
          try {
            equity = calculateEquityAtYear(property, year, propertyValue);
            if (!isFinite(equity) || isNaN(equity) || equity < 0) {
              console.warn(`Invalid equity for ${property.address}: ${equity}, using 0`);
              equity = 0;
            }
          } catch (error) {
            console.error(`Equity calculation failed for ${property.address}:`, error);
            equity = 0;
          }
          
          if (isProjectionYear && showProjections && selectedPayoffScenario !== 'current') {
            // Apply early payoff scenario
            const scenarios = createPayoffScenarios(property);
            const scenario = scenarios.find(s => s.name.toLowerCase().includes(selectedPayoffScenario));
            
            if (scenario && year >= scenario.payoffYear) {
              // Mortgage is paid off early, so equity = full property value
              equity = propertyValue;
            }
          }
          
          const displayLabel = getPropertyDisplayLabel(property);
          // Add safety checks for final values
          const safePropertyValue = isFinite(propertyValue) ? propertyValue : 0;
          const safeCumulativeIncome = isFinite(cumulativeIncome) ? cumulativeIncome : 0;
          const safeEquity = isFinite(equity) ? equity : 0;
          
          dataPoint[`${displayLabel}_value`] = Math.round(safePropertyValue);
          dataPoint[`${displayLabel}_value_plus_income`] = Math.round(safePropertyValue + safeCumulativeIncome);
          dataPoint[`${displayLabel}_equity`] = Math.round(safeEquity);
          dataPoint[`${displayLabel}_equity_plus_income`] = Math.round(safeEquity + safeCumulativeIncome);
        }
      });
      
      // Add ZHVI market data
      Object.keys(visibleMarkets).forEach(market => {
        if (visibleMarkets[market]) {
          const zhviValue = getAnnualZHVI(market, year);
          if (zhviValue) {
            dataPoint[`${market}_zhvi`] = Math.round(zhviValue);
          }
        }
      });
      
      return dataPoint;
    });
  }, [allItems, visibleProperties, viewMode, timeRange, historicalData, visibleMarkets, showProjections, selectedPayoffScenario, rentAnalysis]);

  const chartData = useMemo(() => {
    return generateChartData();
  }, [generateChartData]);
  const colors = ['#8884d8', '#82ca9d', '#a82222', '#ff7300', '#00ff00', '#ff00ff'];

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-600">Asset Value</h3>
        <div className="flex items-center gap-4">
          {/* View Mode Selector */}
          <div className="flex gap-1 border rounded">
            {[{key: 'market', label: 'Market'}, {key: 'equity', label: 'Equity'}].map((mode) => (
              <button
                key={mode.key}
                onClick={() => setViewMode(mode.key)}
                className={`px-3 py-1 text-xs ${
                  viewMode === mode.key
                    ? 'bg-purple-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
          
          {/* Time Range Selector */}
          <div className="flex gap-1">
            {['2y', '5y', '10y', 'all'].map((range) => (
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
          
          {/* Market Toggles */}
          <div className="flex gap-2">
            {Object.keys(visibleMarkets).map((market) => (
              <button
                key={market}
                onClick={() => toggleMarket(market)}
                className={`px-2 py-1 text-xs rounded border ${
                  visibleMarkets[market]
                    ? 'bg-orange-100 text-orange-800 border-orange-300'
                    : 'bg-gray-100 text-gray-500 border-gray-300'
                }`}
              >
                {market}
              </button>
            ))}
          </div>
          
          {/* Projection Controls */}
          <div className="flex gap-2 items-center">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={showProjections}
                onChange={(e) => setShowProjections(e.target.checked)}
                className="w-3 h-3"
              />
              <span className="text-gray-600">5yr Projections</span>
            </label>
            
            {showProjections && (
              <select
                value={selectedPayoffScenario}
                onChange={(e) => setSelectedPayoffScenario(e.target.value)}
                className="text-xs border rounded px-2 py-1 bg-white text-gray-800"
              >
                <option value="current">Current Schedule</option>
                <option value="1">1 Year Early</option>
                <option value="3">3 Years Early</option>
                <option value="5">5 Years Early</option>
              </select>
            )}
          </div>
          
          {/* Property Toggles */}
          <div className="flex flex-wrap gap-2">
            {allItems.map((property, index) => (
              <button
                key={property.id}
                onClick={() => toggleProperty(property.id)}
                className={`px-2 py-1 text-xs rounded ${
                  visibleProperties[property.id]
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-500'
                }`}
                style={{
                  borderLeft: `4px solid ${colors[index % colors.length]}`
                }}
              >
                {getPropertyDisplayLabel(property)}
              </button>
            ))}
          </div>
        </div>
      </div>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
            />
            <Tooltip 
              formatter={(value, name) => [`$${value.toLocaleString()}`, name]}
              labelFormatter={(year) => `Year: ${year}`}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #ccc',
                borderRadius: '4px',
                color: '#333',
                fontSize: '14px',
                fontWeight: '500'
              }}
              labelStyle={{
                color: '#333',
                fontWeight: '600'
              }}
            />
            <Legend 
              iconType="line"
              wrapperStyle={{ paddingTop: '2px' }}
              content={() => {
                // Group legend entries by property
                const propertyGroups = {};
                allItems.forEach((property, index) => {
                  if (visibleProperties[property.id]) {
                    const displayLabel = getPropertyDisplayLabel(property);
                    const color = colors[index % colors.length];
                    propertyGroups[displayLabel] = { color };
                  }
                });

                // Add market legend items
                const marketItems = Object.keys(visibleMarkets)
                  .filter(market => visibleMarkets[market])
                  .map((market, index) => {
                    const marketColors = ['#ff6b35', '#f7931e'];
                    const color = marketColors[index % marketColors.length];
                    return { market, color };
                  });

                return (
                  <div className="flex flex-wrap gap-4 justify-center items-center">
                    {Object.entries(propertyGroups).map(([propertyLabel, data]) => (
                      <div key={propertyLabel} className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: data.color }}>
                          {propertyLabel}:
                        </span>
                        <div className="flex items-center gap-1">
                          <svg width="16" height="3">
                            <line
                              x1="0"
                              y1="1.5"
                              x2="16"
                              y2="1.5"
                              stroke={data.color}
                              strokeWidth="2"
                            />
                          </svg>
                          <span className="text-xs" style={{ color: data.color }}>
                            {viewMode === 'equity' ? 'Equity' : 'Value'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <svg width="16" height="3">
                            <line
                              x1="0"
                              y1="1.5"
                              x2="16"
                              y2="1.5"
                              stroke={data.color}
                              strokeWidth="2"
                              strokeDasharray="5 5"
                            />
                          </svg>
                          <span className="text-xs" style={{ color: data.color }}>
                            {viewMode === 'equity' ? 'Eq+Inc' : 'Val+Inc'}
                          </span>
                        </div>
                      </div>
                    ))}
                    
                    {/* Market legend items */}
                    {marketItems.map(({ market, color }) => (
                      <div key={market} className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <svg width="20" height="3">
                            <line
                              x1="0"
                              y1="1.5"
                              x2="20"
                              y2="1.5"
                              stroke={color}
                              strokeWidth="3"
                              strokeDasharray="10 5"
                            />
                          </svg>
                          <span className="text-sm font-semibold" style={{ color: color }}>{market} ZHVI</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            
            {allItems.map((property, index) => {
              if (!visibleProperties[property.id]) return null;
              const color = colors[index % colors.length];
              const displayLabel = getPropertyDisplayLabel(property);
              
              return (
                <React.Fragment key={property.id}>
                  <Line
                    type="monotone"
                    dataKey={viewMode === 'equity' ? `${displayLabel}_equity` : `${displayLabel}_value`}
                    stroke={color}
                    strokeWidth={2}
                    name={`${displayLabel} - ${viewMode === 'equity' ? 'Equity' : 'Value'}`}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={viewMode === 'equity' ? `${displayLabel}_equity_plus_income` : `${displayLabel}_value_plus_income`}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name={`${displayLabel} - ${viewMode === 'equity' ? 'Eq+Inc' : 'Val+Inc'}`}
                    connectNulls={false}
                  />
                </React.Fragment>
              );
            })}
            
            {/* ZHVI Market Lines */}
            {Object.keys(visibleMarkets).map((market, index) => {
              if (!visibleMarkets[market]) return null;
              const marketColors = ['#ff6b35', '#f7931e']; // Orange colors for markets
              const color = marketColors[index % marketColors.length];
              
              return (
                <Line
                  key={market}
                  type="monotone"
                  dataKey={`${market}_zhvi`}
                  stroke={color}
                  strokeWidth={3}
                  strokeDasharray="10 5"
                  name={`${market} ZHVI`}
                  connectNulls={false}
                  dot={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}