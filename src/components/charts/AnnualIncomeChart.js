import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { analyzeWithCurrentValues } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';

export default function AnnualIncomeChart({ properties, timeRange }) {
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

  // Generate historical income data using real data
  const generateChartData = () => {
    const currentYear = new Date().getFullYear();
    const yearsBack = timeRange === '2y' ? 2 : timeRange === '5y' ? 5 : 10;
    const years = [];
    
    for (let i = yearsBack; i >= 0; i--) {
      years.push(currentYear - i);
    }

    return years.map(year => {
      const dataPoint = { year };
      
      properties.forEach(property => {
        if (!visibleProperties[property.id]) return;
        
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
  const colors = ['#8884d8', '#82ca9d', '#a82222', '#cc5500', '#00ff00', '#ff00ff'];

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-600">Inc Over Time</h3>
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
            />
            <Legend />
            
            {properties.map((property, index) => {
              if (!visibleProperties[property.id]) return null;
              const color = colors[index % colors.length];
              const displayLabel = getPropertyDisplayLabel(property);
              
              return (
                <React.Fragment key={property.id}>
                  <Line
                    type="monotone"
                    dataKey={`${displayLabel}_noi`}
                    stroke={color}
                    strokeWidth={2}
                    name={`${displayLabel} - NOI`}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={`${displayLabel}_cashflow`}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    name={`${displayLabel} - Cash Flow`}
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