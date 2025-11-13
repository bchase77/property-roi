import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { calculateEquityAtYear, analyzeWithCurrentValues, mortgageMonthly } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';
import { mergePropertiesAndScenarios } from '@/lib/scenarioHelpers';

export default function AssetValueChart({ properties = [], scenarios = [] }) {
  const [timeRange, setTimeRange] = useState('10y');
  const [viewMode, setViewMode] = useState('market'); // 'market' or 'equity'
  const [showUnpurchased, setShowUnpurchased] = useState(true);
  const [projectionYears, setProjectionYears] = useState('5y'); // '5y' or '10y'
  const [refreshKey, setRefreshKey] = useState(0);
  const [autoFit, setAutoFit] = useState(false);
  const [yAxisDomain, setYAxisDomain] = useState(['dataMin', 'dataMax']);
  const [xAxisDomain, setXAxisDomain] = useState(['dataMin', 'dataMax']);
  const [showValueLines, setShowValueLines] = useState(true);
  const [showIncomeLines, setShowIncomeLines] = useState(true);
  
  // Merge properties and scenarios into combined list for processing
  const allProperties = useMemo(() => mergePropertiesAndScenarios(properties, scenarios), [properties, scenarios]);
  
  // Stable visibility state - initialize once
  const allItems = allProperties;
  const [visibleProperties, setVisibleProperties] = useState(() => {
    const initial = {};
    allItems.forEach(item => {
      initial[item.id] = true;
    });
    return initial;
  });

  // Update visibility when items change
  useMemo(() => {
    setVisibleProperties(prev => {
      const updated = { ...prev };
      allItems.forEach(item => {
        if (!(item.id in updated)) {
          updated[item.id] = true;
        }
      });
      return updated;
    });
  }, [allItems]);

  // Stable chart data generation
  const chartData = useMemo(() => {
    const currentYear = 2025;
    let startYear;
    
    switch (timeRange) {
      case 'now': startYear = currentYear; break;
      case '2y': startYear = currentYear - 2; break;
      case '5y': startYear = currentYear - 5; break;
      case 'all': startYear = 2012; break;
      default: startYear = currentYear - 10; break;
    }
    
    // Add projection years
    const projectionExtension = projectionYears === '10y' ? 10 : 5;
    const endYear = currentYear + projectionExtension;
    
    const years = [];
    for (let year = startYear; year <= endYear; year++) {
      years.push(year);
    }

    const data = years.map(year => {
      const dataPoint = { year };
      
      // Process all properties (including virtual properties from scenarios) based on purchase status and toggle
      allProperties.forEach((property) => {
        if (!visibleProperties[property.id]) return;
        
        const isPurchased = Boolean(property.purchased);
        if (!isPurchased && !showUnpurchased) return;
        
        const displayLabel = getPropertyDisplayLabel(property);
        const purchaseYear = property.year_purchased || currentYear; // Use current year for unpurchased
        
        // Show data for years after purchase, or from current year for unpurchased
        const startYear = isPurchased ? purchaseYear : currentYear;
        if (year >= startYear) {
          const purchasePrice = Number(property.purchase_price) || 0;
          const currentValue = Number(property.current_market_value) || purchasePrice;
          
          let propertyValue;
          
          if (isPurchased) {
            // Purchased property - use historical/current data and project future
            const yearsOwned = year - purchaseYear;
            const totalYearsOwned = Math.max(1, currentYear - purchaseYear);
            
            if (year === currentYear) {
              propertyValue = currentValue;
            } else if (year < currentYear) {
              // Historical data - use actual appreciation rate
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
            const assumedAppreciationRate = 0.03; // 3% annual appreciation
            propertyValue = currentValue * Math.pow(1 + assumedAppreciationRate, yearsSinceNow);
          }
          
          // Calculate equity with error handling
          let equity = 0;
          if (propertyValue > 0) {
            if (isPurchased) {
              if (year <= currentYear) {
                // Use actual equity calculation for historical/current data
                try {
                  equity = calculateEquityAtYear(property, year, propertyValue);
                  if (!Number.isFinite(equity) || equity < 0) {
                    equity = Math.max(0, propertyValue * 0.2); // 20% fallback
                  }
                } catch {
                  equity = Math.max(0, propertyValue * 0.2);
                }
              } else {
                // For future years, assume mortgage continues to pay down
                try {
                  equity = calculateEquityAtYear(property, year, propertyValue);
                  if (!Number.isFinite(equity) || equity < 0) {
                    equity = propertyValue; // Assume paid off if calculation fails
                  }
                } catch {
                  equity = propertyValue; // Assume paid off if calculation fails
                }
              }
            } else {
              // For unpurchased properties, equity = down payment percentage of value
              const downPaymentPct = (Number(property.down_payment_pct) || 20) / 100;
              equity = propertyValue * downPaymentPct;
            }
          }
          
          // Calculate cumulative net cash flow (NOI - mortgage payments)
          const yearsOfIncome = isPurchased ? Math.max(0, year - purchaseYear) : Math.max(0, year - currentYear);
          let cumulativeNetCashFlow = 0;
          
          if (yearsOfIncome > 0) {
            // Get current NOI and mortgage payment
            const metrics = analyzeWithCurrentValues(property);
            const annualNOI = metrics.noiAnnual || 0;
            
            let annualNetCashFlow = annualNOI;
            
            // For purchased properties with mortgages, subtract mortgage payments
            if (isPurchased && !property.mortgage_free) {
              const monthlyMortgagePayment = metrics.pAndI || 0;
              const annualMortgagePayment = monthlyMortgagePayment * 12;
              annualNetCashFlow = annualNOI - annualMortgagePayment;
            }
            
            // Cumulative net cash flow over all years owned/projected
            cumulativeNetCashFlow = annualNetCashFlow * yearsOfIncome;
          }
          
          // Store rounded values (note: "_plus_income" now represents cumulative net cash flow)
          dataPoint[`${displayLabel}_value`] = Math.round(propertyValue);
          dataPoint[`${displayLabel}_value_plus_income`] = Math.round(propertyValue + cumulativeNetCashFlow);
          dataPoint[`${displayLabel}_equity`] = Math.round(equity);
          dataPoint[`${displayLabel}_equity_plus_income`] = Math.round(equity + cumulativeNetCashFlow);
        }
      });
      
      return dataPoint;
    });
    
    return data;
  }, [allProperties, timeRange, visibleProperties, refreshKey]);

  // Reset auto-fit when visibility changes
  useEffect(() => {
    if (autoFit) {
      setAutoFit(false);
      setYAxisDomain(['dataMin', 'dataMax']);
      setXAxisDomain(['dataMin', 'dataMax']);
    }
  }, [visibleProperties, showUnpurchased, viewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate auto-fit domains based on visible data
  const calculateAutoFit = () => {
    const visibleData = chartData.filter(point => {
      // Check if any visible property has data for this year
      return allProperties.some(property => {
        if (!visibleProperties[property.id]) return false;
        const isPurchased = Boolean(property.purchased);
        if (!isPurchased && !showUnpurchased) return false;
        
        const displayLabel = getPropertyDisplayLabel(property);
        const valueKey = viewMode === 'equity' ? `${displayLabel}_equity` : `${displayLabel}_value`;
        const valueIncomeKey = viewMode === 'equity' ? `${displayLabel}_equity_plus_income` : `${displayLabel}_value_plus_income`;
        
        return point[valueKey] !== undefined || point[valueIncomeKey] !== undefined;
      });
    });

    if (visibleData.length === 0) return;

    // Find min/max Y values across all visible data
    let minY = Infinity;
    let maxY = -Infinity;
    let minX = Infinity;
    let maxX = -Infinity;

    visibleData.forEach(point => {
      if (point.year !== undefined) {
        minX = Math.min(minX, point.year);
        maxX = Math.max(maxX, point.year);
      }

      allProperties.forEach(property => {
        if (!visibleProperties[property.id]) return;
        const isPurchased = Boolean(property.purchased);
        if (!isPurchased && !showUnpurchased) return;

        const displayLabel = getPropertyDisplayLabel(property);
        const valueKey = viewMode === 'equity' ? `${displayLabel}_equity` : `${displayLabel}_value`;
        const valueIncomeKey = viewMode === 'equity' ? `${displayLabel}_equity_plus_income` : `${displayLabel}_value_plus_income`;

        [valueKey, valueIncomeKey].forEach(key => {
          if (point[key] !== undefined && point[key] !== null) {
            minY = Math.min(minY, point[key]);
            maxY = Math.max(maxY, point[key]);
          }
        });
      });
    });

    // Add padding to Y axis (round down to nearest 10K for min, up for max)
    const yPadding = (maxY - minY) * 0.1; // 10% padding
    const paddedMinY = Math.floor((minY - yPadding) / 10000) * 10000;
    const paddedMaxY = Math.ceil((maxY + yPadding) / 10000) * 10000;

    // Set domains
    setYAxisDomain([paddedMinY, paddedMaxY]);
    setXAxisDomain([minX, maxX]);
    setAutoFit(true);
  };

  const resetAutoFit = () => {
    setYAxisDomain(['dataMin', 'dataMax']);
    setXAxisDomain(['dataMin', 'dataMax']);
    setAutoFit(false);
  };

  const toggleProperty = (propertyId) => {
    setVisibleProperties(prev => ({
      ...prev,
      [propertyId]: !prev[propertyId]
    }));
  };

  const refreshChart = () => {
    setRefreshKey(prev => prev + 1);
  };

  const colors = ['#8884d8', '#82ca9d', '#a82222', '#ff7300', '#00ff00', '#ff00ff'];

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-600">Asset Value</h3>
          {autoFit && (
            <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded border border-blue-300">
              Auto-Fitted
            </span>
          )}
          <button
            onClick={refreshChart}
            className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            title="Refresh chart"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
          <button
            onClick={autoFit ? resetAutoFit : calculateAutoFit}
            className={`px-2 py-1 text-xs rounded border flex items-center gap-1 ${
              autoFit 
                ? 'border-blue-500 bg-blue-100 text-blue-700 hover:bg-blue-200' 
                : 'border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
            title={autoFit ? "Reset to default view" : "Auto-fit chart to visible data"}
          >
            <span>{autoFit ? '🔒' : '📐'}</span>
            <span>{autoFit ? 'Reset' : 'Auto-Fit'}</span>
          </button>
        </div>
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
          
          {/* Projection Controls */}
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={showUnpurchased}
                onChange={(e) => setShowUnpurchased(e.target.checked)}
                className="w-3 h-3"
              />
              <span className="text-gray-600">Show Unpurchased</span>
            </label>
            
            <div className="flex gap-1 border rounded">
              {['5y', '10y'].map((years) => (
                <button
                  key={years}
                  onClick={() => setProjectionYears(years)}
                  className={`px-2 py-1 text-xs ${
                    projectionYears === years
                      ? 'bg-green-600 text-white'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {years} Projections
                </button>
              ))}
            </div>
          </div>
          
          {/* Line Type Toggles */}
          <div className="flex gap-2">
            <button
              onClick={() => setShowValueLines(!showValueLines)}
              className={`px-3 py-1 text-xs rounded ${
                showValueLines
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {viewMode === 'equity' ? 'EQUITY' : 'VALUE'}
            </button>
            <button
              onClick={() => setShowIncomeLines(!showIncomeLines)}
              className={`px-3 py-1 text-xs rounded ${
                showIncomeLines
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {viewMode === 'equity' ? 'EQ+INCOME' : 'VAL+INCOME'}
            </button>
          </div>

          {/* Property Toggles */}
          <div className="flex flex-wrap gap-2">
            {allProperties.map((property, index) => {
              const isPurchased = Boolean(property.purchased);
              if (!isPurchased && !showUnpurchased) return null;
              
              return (
                <button
                  key={property.id}
                  onClick={() => toggleProperty(property.id)}
                  className={`px-2 py-1 text-xs rounded ${
                    visibleProperties[property.id]
                      ? (isPurchased ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800')
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  style={{
                    borderLeftWidth: '4px',
                    borderLeftStyle: 'solid',
                    borderLeftColor: colors[index % colors.length]
                  }}
                >
                  {getPropertyDisplayLabel(property)}{!isPurchased ? ' 📊' : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="year" 
              domain={autoFit ? xAxisDomain : ['dataMin', 'dataMax']}
              type="number"
              scale="linear"
            />
            <YAxis 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
              domain={autoFit ? yAxisDomain : [0, 'dataMax']}
              type="number"
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
                return (
                  <div className="space-y-3">
                    {/* Property Colors Legend */}
                    <div className="flex flex-wrap gap-4 justify-center items-center">
                      <span className="text-xs font-semibold text-gray-600 mr-2">Properties:</span>
                      {allProperties
                        .filter(property => {
                          const isPurchased = Boolean(property.purchased);
                          return visibleProperties[property.id] && (isPurchased || showUnpurchased);
                        })
                        .map((property, index) => {
                          const displayLabel = getPropertyDisplayLabel(property);
                          const color = colors[index % colors.length];
                          const isPurchased = Boolean(property.purchased);
                          return (
                            <div key={property.id} className="flex items-center gap-1">
                              <div 
                                className="w-4 h-1 rounded"
                                style={{ 
                                  backgroundColor: color,
                                  borderStyle: isPurchased ? 'solid' : 'dashed',
                                  borderWidth: isPurchased ? '0' : '1px',
                                  borderColor: color
                                }}
                              />
                              <span className="text-xs font-medium" style={{ color: color }}>
                                {displayLabel}{!isPurchased ? ' (Projected)' : ''}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                    
                    {/* Line Types Legend */}
                    <div className="flex flex-wrap gap-4 justify-center items-center">
                      <span className="text-xs font-semibold text-gray-600 mr-2">Data:</span>
                      <div className="flex items-center gap-1">
                        <svg width="16" height="3">
                          <line x1="0" y1="1.5" x2="16" y2="1.5" stroke="#666" strokeWidth="2" />
                        </svg>
                        <span className="text-xs text-gray-700">{viewMode === 'equity' ? 'Equity' : 'Value'} (solid for owned, dashed for projected)</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <svg width="16" height="3">
                          <line x1="0" y1="1.5" x2="16" y2="1.5" stroke="#666" strokeWidth="2" strokeDasharray="5 5" />
                        </svg>
                        <span className="text-xs text-gray-700">{viewMode === 'equity' ? 'Eq+Income' : 'Val+Income'} (dotted)</span>
                      </div>
                    </div>
                  </div>
                );
              }}
            />
            
            {allProperties
              .filter(property => {
                const isPurchased = Boolean(property.purchased);
                return visibleProperties[property.id] && (isPurchased || showUnpurchased);
              })
              .map((property, index) => {
                const color = colors[index % colors.length];
                const displayLabel = getPropertyDisplayLabel(property);
                const isPurchased = Boolean(property.purchased);
                const strokeDashArray = isPurchased ? "0" : "8 4"; // Dashed lines for unpurchased
                
                return (
                  <React.Fragment key={property.id}>
                    {showValueLines && (
                      <Line
                        type="monotone"
                        dataKey={viewMode === 'equity' ? `${displayLabel}_equity` : `${displayLabel}_value`}
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray={strokeDashArray}
                        name={`${displayLabel}${isPurchased ? '' : ' (Projected)'} - ${viewMode === 'equity' ? 'Equity' : 'Value'}`}
                        connectNulls={false}
                      />
                    )}
                    {showIncomeLines && (
                      <Line
                        type="monotone"
                        dataKey={viewMode === 'equity' ? `${displayLabel}_equity_plus_income` : `${displayLabel}_value_plus_income`}
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray={isPurchased ? "5 5" : "3 3"}
                        name={`${displayLabel}${isPurchased ? '' : ' (Projected)'} - ${viewMode === 'equity' ? 'Eq+Cash' : 'Val+Cash'}`}
                        connectNulls={false}
                      />
                    )}
                  </React.Fragment>
                );
              })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}