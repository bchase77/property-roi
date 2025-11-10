import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { analyzeWithCurrentValues } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';
import { projectRent, createPayoffScenarios } from '@/lib/rentProjections';

export default function AnnualIncomeChart({ properties }) {
  const [visibleProperties, setVisibleProperties] = useState(
    properties.reduce((acc, prop) => ({ ...acc, [prop.id]: true }), {})
  );
  const [visibleMetrics, setVisibleMetrics] = useState({
    NOI: true,
    CashFlow: true
  });
  const [timeRange, setTimeRange] = useState('10y');
  const [refreshKey, setRefreshKey] = useState(0);
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
        }
      } catch (error) {
        console.error('Failed to fetch historical data:', error);
      }
    };
    
    fetchHistoricalData();
  }, [properties, refreshKey]);

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

  // Generate historical income data using real data
  const generateChartData = () => {
    // Use a consistent year to avoid hydration mismatches
    const currentYear = 2025;
    let startYear;
    
    if (timeRange === 'all') {
      startYear = 2012;
    } else {
      const yearsBack = timeRange === '2y' ? 2 : timeRange === '5y' ? 5 : 10;
      startYear = currentYear - yearsBack;
    }
    
    const years = [];
    for (let year = startYear; year <= currentYear; year++) {
      years.push(year);
    }

    return years.map(year => {
      const dataPoint = { year };
      
      properties.forEach(property => {
        if (!visibleProperties[property.id]) return;
        
        // Only process purchased properties for income metrics
        if (!property.purchased) return;
        
        const propertyHistoricalData = historicalData[property.id] || [];
        const yearData = propertyHistoricalData.find(d => d.year === year);
        const yearsOwned = property.year_purchased ? year - property.year_purchased : 0;
        
        if (yearsOwned >= 0) {
          let grossIncome, totalExpenses, netIncome, cashFlow;
          
          if (yearData) {
            // Use real historical data
            grossIncome = yearData.grossIncome;
            totalExpenses = yearData.totalExpenses;
            netIncome = yearData.netIncome; // This is NOI equivalent (gross - expenses)
            
            // Estimate cash flow (net income minus debt service)
            // We'll need to estimate debt service for historical years
            const metrics = analyzeWithCurrentValues(property);
            const currentDebtService = (metrics.pAndI || 0) * 12;
            
            // Assume debt service was similar (this is an approximation)
            cashFlow = netIncome - currentDebtService;
            
          } else {
            // Fallback to estimated data
            const metrics = analyzeWithCurrentValues(property);
            const growthRate = 0.02;
            const yearsFromPurchase = Math.max(0, yearsOwned);
            const incomeMultiplier = Math.pow(1 + growthRate, yearsFromPurchase);
            
            const baseNOI = metrics.noiAnnual / incomeMultiplier;
            netIncome = baseNOI * Math.pow(1 + growthRate, yearsFromPurchase);
            cashFlow = metrics.cashflowMonthly * 12 * Math.pow(1 + growthRate, yearsFromPurchase);
          }
          
          const displayLabel = getPropertyDisplayLabel(property);
          dataPoint[`${displayLabel}_noi`] = Math.round(netIncome);
          dataPoint[`${displayLabel}_cashflow`] = Math.round(cashFlow);
          
          // Also include gross income and expenses if we have real data
          if (yearData) {
            dataPoint[`${displayLabel}_gross`] = Math.round(grossIncome);
            dataPoint[`${displayLabel}_expenses`] = Math.round(totalExpenses);
          }
        }
      });
      
      return dataPoint;
    });
  };

  const chartData = generateChartData();
  
  const refreshChart = () => {
    setRefreshKey(prev => prev + 1);
  };
  
  const colors = ['#8884d8', '#82ca9d', '#a82222', '#cc5500', '#00ff00', '#ff00ff'];

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-600">Inc Over Time</h3>
          <button
            onClick={refreshChart}
            className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
            title="Refresh chart"
          >
            <span>🔄</span>
            <span>Refresh</span>
          </button>
        </div>
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
          
          {/* Property Toggles */}
          <div className="flex flex-wrap gap-2">
            {properties.filter(property => property.purchased).map((property, index) => (
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
            />
            <Legend 
              iconType="line"
              wrapperStyle={{ paddingTop: '2px' }}
              content={() => {
                // Group legend entries by property
                const propertyGroups = {};
                properties.filter(property => property.purchased).forEach((property, index) => {
                  if (visibleProperties[property.id]) {
                    const displayLabel = getPropertyDisplayLabel(property);
                    const color = colors[index % colors.length];
                    propertyGroups[displayLabel] = { color };
                  }
                });

                return (
                  <div className="flex flex-wrap gap-4 justify-center items-center">
                    {Object.entries(propertyGroups).map(([propertyLabel, data]) => (
                      <div key={propertyLabel} className="flex items-center gap-2">
                        <span className="text-sm font-semibold" style={{ color: data.color }}>
                          {propertyLabel}:
                        </span>
                        {visibleMetrics.NOI && (
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
                            <span className="text-xs" style={{ color: data.color }}>NOI</span>
                          </div>
                        )}
                        {visibleMetrics.CashFlow && (
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
                            <span className="text-xs" style={{ color: data.color }}>Cash Flow</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            
            {properties.filter(property => property.purchased).map((property, index) => {
              if (!visibleProperties[property.id]) return null;
              const color = colors[index % colors.length];
              const displayLabel = getPropertyDisplayLabel(property);
              
              return (
                <React.Fragment key={property.id}>
                  {visibleMetrics.NOI && (
                    <Line
                      type="monotone"
                      dataKey={`${displayLabel}_noi`}
                      stroke={color}
                      strokeWidth={2}
                      name={`${displayLabel} - NOI`}
                      connectNulls={false}
                    />
                  )}
                  {visibleMetrics.CashFlow && (
                    <Line
                      type="monotone"
                      dataKey={`${displayLabel}_cashflow`}
                      stroke={color}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      name={`${displayLabel} - Cash Flow`}
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