import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { analyzeWithCurrentValues } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';

export default function AssetValueChart({ properties, timeRange }) {
  const [visibleProperties, setVisibleProperties] = useState(
    properties.reduce((acc, prop) => ({ ...acc, [prop.id]: true }), {})
  );
  const [historicalData, setHistoricalData] = useState({});

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

  const toggleProperty = (propertyId) => {
    setVisibleProperties(prev => ({
      ...prev,
      [propertyId]: !prev[propertyId]
    }));
  };

  // Generate historical data points using real data
  const generateChartData = () => {
    const currentYear = new Date().getFullYear();
    const startYear = 2012;
    const years = [];
    
    for (let year = startYear; year <= currentYear; year++) {
      years.push(year);
    }

    return years.map(year => {
      const dataPoint = { year };
      
      properties.forEach(property => {
        if (!visibleProperties[property.id]) return;
        
        const propertyHistoricalData = historicalData[property.id] || [];
        const yearData = propertyHistoricalData.find(d => d.year === year);
        const yearsOwned = property.year_purchased ? year - property.year_purchased : 0;
        
        if (yearsOwned >= 0) {
          const purchasePrice = Number(property.purchase_price) || 0;
          const currentValue = Number(property.current_market_value) || purchasePrice;
          
          // Use real Zillow values when available, interpolate for missing years
          let propertyValue;
          
          if (year <= property.year_purchased) {
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
                const totalYearsOwned = currentYear - property.year_purchased;
                const progressRatio = totalYearsOwned > 0 ? (year - property.year_purchased) / totalYearsOwned : 0;
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
          
          // Calculate cumulative income through this year
          let cumulativeIncome = 0;
          const allHistoricalData = historicalData[property.id] || [];
          
          for (let incomeYear = property.year_purchased; incomeYear <= year; incomeYear++) {
            const incomeYearData = allHistoricalData.find(d => d.year === incomeYear);
            if (incomeYearData) {
              cumulativeIncome += incomeYearData.netIncome;
            } else if (incomeYear >= property.year_purchased) {
              // Estimate income for missing years
              const metrics = analyzeWithCurrentValues(property);
              const estimatedAnnualIncome = metrics.noiAnnual;
              cumulativeIncome += estimatedAnnualIncome;
            }
          }
          
          const displayLabel = getPropertyDisplayLabel(property);
          dataPoint[`${displayLabel}_value`] = Math.round(propertyValue);
          dataPoint[`${displayLabel}_value_plus_income`] = Math.round(propertyValue + cumulativeIncome);
        }
      });
      
      return dataPoint;
    });
  };

  const chartData = generateChartData();
  const colors = ['#8884d8', '#82ca9d', '#a82222', '#ff7300', '#00ff00', '#ff00ff'];

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-600">Asset Value</h3>
        <div className="flex flex-wrap gap-2">
          {properties.map((property, index) => (
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
              wrapperStyle={{ paddingTop: '20px' }}
              content={(props) => {
                const { payload } = props;
                return (
                  <div className="flex flex-wrap gap-4 justify-center mt-4">
                    {payload.map((entry, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <svg width="30" height="4">
                          <line
                            x1="0"
                            y1="2"
                            x2="30"
                            y2="2"
                            stroke={entry.color}
                            strokeWidth="2"
                            strokeDasharray={entry.payload.strokeDasharray || "0"}
                          />
                        </svg>
                        <span className="text-sm font-medium" style={{ color: entry.color }}>
                          {entry.value}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            
            {properties.map((property, index) => {
              if (!visibleProperties[property.id]) return null;
              const color = colors[index % colors.length];
              const displayLabel = getPropertyDisplayLabel(property);
              
              return (
                <React.Fragment key={property.id}>
                  <Line
                    type="monotone"
                    dataKey={`${displayLabel}_value`}
                    stroke={color}
                    strokeWidth={2}
                    name={`${displayLabel} - Value`}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={`${displayLabel}_value_plus_income`}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name={`${displayLabel} - Val+Inc`}
                    connectNulls={false}
                  />
                </React.Fragment>
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}