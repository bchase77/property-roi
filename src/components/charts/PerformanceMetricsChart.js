import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { analyzeWithCurrentValues, calculateCAGR, calculateIRR, calculateEquityAtYear } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';
import { projectRent, createPayoffScenarios } from '@/lib/rentProjections';
import { mergePropertiesAndScenarios } from '@/lib/scenarioHelpers';

export default function PerformanceMetricsChart({ properties, scenarios = [] }) {
  // Merge properties and scenarios into a single array for processing
  const allItems = mergePropertiesAndScenarios(properties, scenarios);
  const [visibleProperties, setVisibleProperties] = useState(
    allItems.reduce((acc, item) => ({ ...acc, [item.id]: true }), {})
  );

  // Update visibility state when properties or scenarios change
  useEffect(() => {
    setVisibleProperties(
      allItems.reduce((acc, item) => ({ ...acc, [item.id]: true }), {})
    );
  }, [properties, scenarios]);
  const [visibleMetrics, setVisibleMetrics] = useState({
    CAGR: true,
    CoC: true,
    IRR: true
  });
  const [timeRange, setTimeRange] = useState('10y');
  const [historicalData, setHistoricalData] = useState({});
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
        } else {
          console.error('Failed to fetch historical data:', response.status, response.statusText);
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

  const toggleMetric = (metric) => {
    setVisibleMetrics(prev => ({
      ...prev,
      [metric]: !prev[metric]
    }));
  };

  // Generate historical performance data using real data
  const generateChartData = () => {
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
        
        if (yearsOwned >= 1 || isProjectionYear) { // Need at least 1 year for meaningful percentages
          const purchasePrice = Number(property.purchase_price) || 0;
          const currentValue = Number(property.current_market_value) || purchasePrice;
          const initialInvestment = Number(property.initial_investment) || 
            (purchasePrice * (Number(property.down_payment_pct) || 20) / 100);
          
          let netIncome, cagr = 0, cashOnCash = 0, irrPct = 0;
          
          // Calculate property value for this year using real Zillow data
          let historicalValue;
          
          if (year <= effectivePurchaseYear) {
            historicalValue = purchasePrice;
          } else {
            // Check if we have Zillow data for this year
            if (yearData && yearData.zillowValue) {
              historicalValue = yearData.zillowValue;
            } else {
              // Find surrounding Zillow values for interpolation
              const allHistoricalData = historicalData[property.id] || [];
              const zillowData = allHistoricalData.filter(d => d.zillowValue).sort((a, b) => a.year - b.year);
              
              if (zillowData.length === 0) {
                // No Zillow data, fall back to linear interpolation
                const totalYearsOwned = currentYear - effectivePurchaseYear;
                const progressRatio = totalYearsOwned > 0 ? (year - effectivePurchaseYear) / totalYearsOwned : 0;
                historicalValue = purchasePrice + (currentValue - purchasePrice) * Math.max(0, Math.min(progressRatio, 1));
              } else {
                // Find closest Zillow values before and after this year
                const beforeData = zillowData.filter(d => d.year <= year).pop();
                const afterData = zillowData.find(d => d.year > year);
                
                if (beforeData && afterData) {
                  // Interpolate between known Zillow values
                  const yearsDiff = afterData.year - beforeData.year;
                  const progressRatio = (year - beforeData.year) / yearsDiff;
                  historicalValue = beforeData.zillowValue + (afterData.zillowValue - beforeData.zillowValue) * progressRatio;
                } else if (beforeData) {
                  // Use the most recent Zillow value
                  historicalValue = beforeData.zillowValue;
                } else if (afterData) {
                  // Use the earliest Zillow value
                  historicalValue = afterData.zillowValue;
                }
              }
            }
          }
          
          // Calculate accurate equity using mortgage payoff date
          let historicalEquity = calculateEquityAtYear(property, year, historicalValue);
          
          if (yearData) {
            // Use real historical data for income
            netIncome = yearData.netIncome; // grossIncome - totalExpenses
            cashOnCash = initialInvestment > 0 ? (netIncome / initialInvestment) * 100 : 0;
            
            // Calculate cumulative income through this year (used in IRR calculation)
            const allHistoricalData = historicalData[property.id] || [];
            
            // IRR calculation using cash flows
            if (yearsOwned >= 1) {
              const cashFlows = [-initialInvestment]; // Initial investment as negative
              for (let irrYear = effectivePurchaseYear; irrYear <= year; irrYear++) {
                const irrYearData = allHistoricalData.find(d => d.year === irrYear);
                if (irrYearData) {
                  cashFlows.push(irrYearData.netIncome);
                }
              }
              // Add final equity value for the last year
              if (year === currentYear || year >= property.year_purchased + yearsOwned) {
                cashFlows[cashFlows.length - 1] += historicalEquity; // Add equity value to final cash flow
              }
              irrPct = calculateIRR(cashFlows);
            }
          } else {
            // Fallback to current data estimates
            const metrics = analyzeWithCurrentValues(property);
            netIncome = metrics.noiAnnual;
            cashOnCash = metrics.metrics.cashOnCash;
            
            // Simple IRR estimation for missing data
            irrPct = yearsOwned >= 2 ? calculateCAGR(initialInvestment, historicalEquity, yearsOwned) : null;
          }
          
          // Handle projections for future years
          if (isProjectionYear && showProjections) {
            const currentRent = Number(property.current_rent_monthly || property.monthly_rent) || 0;
            const stateData = rentAnalysis[property.state];
            const rentProjections = projectRent(currentRent, property.state, stateData);
            
            const projectionIndex = year - currentYear - 1;
            const projectedRent = rentProjections[projectionIndex]?.projectedRent || currentRent;
            
            // Calculate projected metrics
            const metrics = analyzeWithCurrentValues(property);
            const currentNOI = metrics.noiAnnual;
            const currentGrossRent = currentRent * 12;
            const currentExpenses = currentGrossRent - currentNOI;
            
            const projectedGrossRent = projectedRent * 12;
            const inflationRate = 0.02;
            const projectedExpenses = currentExpenses * Math.pow(1 + inflationRate, year - currentYear);
            const projectedNOI = projectedGrossRent - projectedExpenses;
            
            // Projected property value (3% appreciation)
            const projectedValue = currentValue * Math.pow(1.03, year - currentYear);
            
            // Check if mortgage is paid off in scenario
            const scenarios = createPayoffScenarios(property);
            const scenario = scenarios.find(s => s.name.toLowerCase().includes(selectedPayoffScenario));
            const mortgagePaidOff = scenario && year >= scenario.payoffYear;
            
            // Calculate projected equity
            let projectedEquity;
            if (mortgagePaidOff) {
              projectedEquity = projectedValue; // Full ownership
            } else {
              projectedEquity = calculateEquityAtYear(property, year, projectedValue);
            }
            
            // Calculate projected metrics
            cashOnCash = initialInvestment > 0 ? (projectedNOI / initialInvestment) * 100 : 0;
            const projectedYearsOwned = year - effectivePurchaseYear;
            
            // For CAGR, use property value appreciation only (not leveraged equity growth)
            // This gives a more realistic view of actual property performance
            const startingPropertyValue = purchasePrice;
            cagr = calculateCAGR(startingPropertyValue, projectedValue, projectedYearsOwned) || 0;
            
            // Debug CAGR calculation for unrealistic values
            if (cagr > 20) {
              console.log(`High CAGR detected for ${property.address} year ${year}:`, {
                startingPropertyValue,
                projectedValue, 
                projectedYearsOwned,
                cagr,
                calculationUsed: 'property appreciation only'
              });
            }
            
            // For IRR, we'd need to calculate cumulative cash flows through projection
            // For now, use CAGR as approximation for projections
            irrPct = cagr || 0;
            
            historicalEquity = projectedEquity;
          } else {
            // Calculate CAGR using property value appreciation for historical data  
            cagr = calculateCAGR(purchasePrice, historicalValue, yearsOwned);
          }
          
          // Debug logging removed - CAGR issue resolved
          
          // Only show CAGR after 3+ years to avoid meaningless early high numbers, but allow projections
          const displayLabel = getPropertyDisplayLabel(property);
          const effectiveYearsOwned = isProjectionYear ? year - effectivePurchaseYear : yearsOwned;
          
          // Ensure we show data for projections even if historical requirements aren't met
          const minYearsForCAGR = isProjectionYear ? 1 : 3;
          const minYearsForIRR = isProjectionYear ? 1 : 2;
          
          const cagrValue = (cagr && !isNaN(cagr) && effectiveYearsOwned >= minYearsForCAGR) ? Number(cagr.toFixed(1)) : null;
          const cocValue = (cashOnCash && !isNaN(cashOnCash)) ? Number(cashOnCash.toFixed(1)) : null;
          const irrValue = (irrPct && !isNaN(irrPct) && effectiveYearsOwned >= minYearsForIRR) ? Number(irrPct.toFixed(1)) : null;
          
          // Debug logging for first property and year 2025+ to see what's happening
          if (property.id === properties[0]?.id && year >= 2025) {
            console.log(`Debug ${displayLabel} ${year}:`, {
              isProjectionYear, 
              effectiveYearsOwned, 
              minYearsForCAGR, 
              cagr, 
              cashOnCash, 
              irrPct,
              cagrValue,
              cocValue,
              irrValue
            });
          }
          
          dataPoint[`${displayLabel}_cagr`] = cagrValue;
          dataPoint[`${displayLabel}_coc`] = cocValue;
          dataPoint[`${displayLabel}_irr`] = irrValue;
        }
      });
      
      return dataPoint;
    });
  };

  const chartData = generateChartData();
  const colors = ['#8884d8', '#82ca9d', '#a82222', '#cc5500', '#00ff00', '#ff00ff'];

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-600">Perf Metrics</h3>
        <div className="flex items-center gap-4">
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
          
          {/* Metric Toggles */}
          <div className="flex gap-2">
            {Object.keys(visibleMetrics).map((metric) => (
              <button
                key={metric}
                onClick={() => toggleMetric(metric)}
                className={`px-2 py-1 text-xs rounded border ${
                  visibleMetrics[metric]
                    ? 'bg-green-100 text-green-800 border-green-300'
                    : 'bg-gray-100 text-gray-500 border-gray-300'
                }`}
              >
                {metric}
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
          <LineChart data={chartData} margin={{ top: 20, right: 20, left: 20, bottom: 15 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="year" />
            <YAxis 
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              formatter={(value, name) => [`${value}%`, name]}
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
                    propertyGroups[displayLabel] = { color, metrics: [] };
                  }
                });

                // Add metric legend items
                const metricStyles = {
                  'CAGR': '0',
                  'CoC': '5 5', 
                  'IRR': '2 2'
                };

                return (
                  <div className="flex flex-wrap gap-4 justify-center items-center">
                    {Object.entries(propertyGroups).map(([propertyLabel, data]) => (
                      <div key={propertyLabel} className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: data.color }}>
                          {propertyLabel}:
                        </span>
                        {Object.entries(metricStyles)
                          .filter(([metric]) => visibleMetrics[metric])
                          .map(([metric, dashArray]) => (
                          <div key={metric} className="flex items-center gap-1">
                            <svg width="16" height="3">
                              <line
                                x1="0"
                                y1="1.5"
                                x2="16"
                                y2="1.5"
                                stroke={data.color}
                                strokeWidth="2"
                                strokeDasharray={dashArray}
                              />
                            </svg>
                            <span className="text-xs" style={{ color: data.color }}>{metric}</span>
                          </div>
                        ))}
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
                  {visibleMetrics.CAGR && (
                    <Line
                      type="monotone"
                      dataKey={`${displayLabel}_cagr`}
                      stroke={color}
                      strokeWidth={2}
                      name={`${displayLabel} - CAGR`}
                      connectNulls={false}
                    />
                  )}
                  {visibleMetrics.CoC && (
                    <Line
                      type="monotone"
                      dataKey={`${displayLabel}_coc`}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name={`${displayLabel} - CoC`}
                      connectNulls={false}
                    />
                  )}
                  {visibleMetrics.IRR && (
                    <Line
                      type="monotone"
                      dataKey={`${displayLabel}_irr`}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="2 2"
                      name={`${displayLabel} - IRR`}
                      connectNulls={false}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 p-3 bg-gray-50 rounded text-xs text-gray-600">
        <h4 className="font-semibold mb-3">Metric Calculation Methods:</h4>
        
        <div className="mb-4">
          <h5 className="font-semibold text-blue-700 mb-1">Cash-on-Cash Return (CoC):</h5>
          <p className="mb-1">
            <strong>Annual metric</strong> calculated each year as: <code>Net Operating Income ÷ Initial Investment × 100</code>
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Net Operating Income:</strong> Rental income minus all operating expenses (taxes, insurance, maintenance, etc.)</li>
            <li><strong>Initial Investment:</strong> Down payment + closing costs + initial repairs</li>
            <li><strong>Purpose:</strong> Shows the cash return on your actual cash invested for that specific year</li>
          </ul>
        </div>

        <div className="mb-4">
          <h5 className="font-semibold text-green-700 mb-1">Compound Annual Growth Rate (CAGR):</h5>
          <p className="mb-1">
            <strong>Cumulative metric</strong> calculated as: <code>(Current Equity ÷ Initial Investment)^(1/Years) - 1 × 100</code>
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Current Equity:</strong> Current market value minus remaining mortgage balance</li>
            <li><strong>Initial Investment:</strong> Your original cash investment</li>
            <li><strong>Purpose:</strong> Shows the annualized growth rate of your equity over time</li>
            <li><em>Note: Only displays after 3+ years for meaningful results</em></li>
          </ul>
        </div>

        <div>
          <h5 className="font-semibold text-red-700 mb-1">Internal Rate of Return (IRR):</h5>
          <p className="mb-1">
            <strong>Cumulative metric</strong> using all cash flows from property purchase through the current year:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li><strong>Initial Investment:</strong> Down payment + closing costs (negative cash flow)</li>
            <li><strong>Annual Cash Flows:</strong> Net Operating Income for each year owned</li>
            <li><strong>Terminal Value:</strong> Current equity value added to final year</li>
            <li><strong>Calculation:</strong> The discount rate that makes Net Present Value (NPV) = 0</li>
            <li><strong>Purpose:</strong> Annualized return rate accounting for both cash flow timing and appreciation</li>
            <li><em>Note: Only displays after 2+ years for meaningful results</em></li>
          </ul>
        </div>
      </div>
    </div>
  );
}