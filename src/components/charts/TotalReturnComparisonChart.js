import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { analyzeWithCurrentValues } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';

// Historical benchmark data (approximate annual total returns)
const BENCHMARK_DATA = {
  'S&P 500': {
    2012: 16.0, 2013: 32.4, 2014: 13.7, 2015: 1.4, 2016: 12.0,
    2017: 21.8, 2018: -4.4, 2019: 31.5, 2020: 18.4, 2021: 28.7,
    2022: -18.1, 2023: 26.3, 2024: 25.0
  },
  'REITs': {
    2012: 19.7, 2013: 2.9, 2014: 30.0, 2015: 2.5, 2016: 8.6,
    2017: 9.2, 2018: -4.2, 2019: 25.8, 2020: -5.1, 2021: 40.3,
    2022: -24.3, 2023: 13.4, 2024: 12.0
  },
  '10Y Treasury': {
    2012: 4.2, 2013: -9.1, 2014: 10.8, 2015: 1.3, 2016: 0.7,
    2017: 2.3, 2018: -0.0, 2019: 9.7, 2020: 8.0, 2021: -2.3,
    2022: -12.9, 2023: 3.1, 2024: 2.5
  }
};

export default function TotalReturnComparisonChart({ properties, timeRange }) {
  const [visibleSeries, setVisibleSeries] = useState(
    properties.reduce((acc, prop) => ({ ...acc, [prop.id]: true }), {
      'S&P 500': true,
      'REITs': true,
      '10Y Treasury': false
    })
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

  const toggleSeries = (seriesId) => {
    setVisibleSeries(prev => ({
      ...prev,
      [seriesId]: !prev[seriesId]
    }));
  };

  // Calculate cumulative total returns from annual returns
  const calculateCumulativeReturns = (annualReturns, startYear, endYear) => {
    let cumulativeReturn = 0;
    const results = {};
    
    for (let year = startYear; year <= endYear; year++) {
      if (annualReturns[year] !== undefined) {
        cumulativeReturn = (1 + cumulativeReturn / 100) * (1 + annualReturns[year] / 100) * 100 - 100;
      }
      results[year] = cumulativeReturn;
    }
    
    return results;
  };

  // Generate chart data
  const generateChartData = () => {
    const currentYear = new Date().getFullYear();
    const startYear = 2012;
    const years = [];
    
    for (let year = startYear; year <= currentYear; year++) {
      years.push(year);
    }

    // Calculate cumulative returns for benchmarks
    const sp500Cumulative = calculateCumulativeReturns(BENCHMARK_DATA['S&P 500'], startYear, currentYear);
    const reitsCumulative = calculateCumulativeReturns(BENCHMARK_DATA['REITs'], startYear, currentYear);
    const treasuryCumulative = calculateCumulativeReturns(BENCHMARK_DATA['10Y Treasury'], startYear, currentYear);

    return years.map(year => {
      const dataPoint = { year };
      
      // Add benchmark data
      if (visibleSeries['S&P 500']) {
        dataPoint['S&P 500'] = Math.round(sp500Cumulative[year] * 10) / 10;
      }
      if (visibleSeries['REITs']) {
        dataPoint['REITs'] = Math.round(reitsCumulative[year] * 10) / 10;
      }
      if (visibleSeries['10Y Treasury']) {
        dataPoint['10Y Treasury'] = Math.round(treasuryCumulative[year] * 10) / 10;
      }
      
      // Add property data
      properties.forEach(property => {
        if (!visibleSeries[property.id]) return;
        
        const propertyHistoricalData = historicalData[property.id] || [];
        const yearData = propertyHistoricalData.find(d => d.year === year);
        const yearsOwned = property.year_purchased ? year - property.year_purchased : 0;
        
        if (yearsOwned >= 0) {
          const purchasePrice = Number(property.purchase_price) || 0;
          const currentValue = Number(property.current_market_value) || purchasePrice;
          const initialInvestment = Number(property.initial_investment) || 
            (purchasePrice * (Number(property.down_payment_pct) || 20) / 100);
          
          let totalReturnPct = 0;
          
          if (yearData) {
            // Use real historical data
            const totalYearsOwned = currentYear - property.year_purchased;
            const progressRatio = totalYearsOwned > 0 ? (year - property.year_purchased) / totalYearsOwned : 0;
            const historicalValue = purchasePrice + (currentValue - purchasePrice) * Math.max(0, progressRatio);
            
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
            
            // Total Return % = (Current Value + Cumulative Income - Initial Investment) / Initial Investment
            totalReturnPct = initialInvestment > 0 ? ((historicalValue + cumulativeIncome - initialInvestment) / initialInvestment) * 100 : 0;
            
          } else if (yearsOwned > 0) {
            // Fallback to estimated data
            const metrics = analyzeWithCurrentValues(property);
            const totalYearsOwned = currentYear - property.year_purchased;
            const progressRatio = Math.min(yearsOwned / totalYearsOwned, 1);
            const historicalValue = purchasePrice + (currentValue - purchasePrice) * progressRatio;
            
            // Estimate cumulative income
            const estimatedCumulativeIncome = metrics.noiAnnual * yearsOwned;
            totalReturnPct = initialInvestment > 0 ? ((historicalValue + estimatedCumulativeIncome - initialInvestment) / initialInvestment) * 100 : 0;
          }
          
          const displayLabel = getPropertyDisplayLabel(property);
          dataPoint[displayLabel] = Math.round(totalReturnPct * 10) / 10;
        }
      });
      
      return dataPoint;
    });
  };

  const chartData = generateChartData();
  const propertyColors = ['#8884d8', '#82ca9d', '#a82222', '#cc5500', '#00ff00', '#ff00ff'];
  const benchmarkColors = {
    'S&P 500': '#1f77b4',
    'REITs': '#ff7f0e', 
    '10Y Treasury': '#2ca02c'
  };

  const allSeries = [
    ...properties.map((prop, index) => ({ 
      id: prop.id, 
      label: getPropertyDisplayLabel(prop), 
      color: propertyColors[index % propertyColors.length],
      type: 'property'
    })),
    { id: 'S&P 500', label: 'S&P 500', color: benchmarkColors['S&P 500'], type: 'benchmark' },
    { id: 'REITs', label: 'REITs', color: benchmarkColors['REITs'], type: 'benchmark' },
    { id: '10Y Treasury', label: '10Y Treasury', color: benchmarkColors['10Y Treasury'], type: 'benchmark' }
  ];

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-600">Total Return Comparison</h3>
        <div className="flex flex-wrap gap-2">
          {allSeries.map((series) => (
            <button
              key={series.id}
              onClick={() => toggleSeries(series.id)}
              className={`px-2 py-1 text-xs rounded ${
                visibleSeries[series.id]
                  ? series.type === 'benchmark' 
                    ? 'bg-orange-100 text-orange-800'
                    : 'bg-blue-100 text-blue-800'
                  : 'bg-gray-100 text-gray-500'
              }`}
              style={{
                borderLeft: `4px solid ${series.color}`
              }}
            >
              {series.label}
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
            <Legend />
            
            {/* Property lines */}
            {properties.map((property, index) => {
              if (!visibleSeries[property.id]) return null;
              const displayLabel = getPropertyDisplayLabel(property);
              const color = propertyColors[index % propertyColors.length];
              
              return (
                <Line
                  key={property.id}
                  type="monotone"
                  dataKey={displayLabel}
                  stroke={color}
                  strokeWidth={2}
                  name={displayLabel}
                  connectNulls={false}
                />
              );
            })}
            
            {/* Benchmark lines */}
            {Object.keys(benchmarkColors).map((benchmark) => {
              if (!visibleSeries[benchmark]) return null;
              
              return (
                <Line
                  key={benchmark}
                  type="monotone"
                  dataKey={benchmark}
                  stroke={benchmarkColors[benchmark]}
                  strokeWidth={3}
                  strokeDasharray="8 4"
                  name={benchmark}
                  connectNulls={false}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 text-xs text-gray-500">
        <p>* Benchmark data includes dividends/income reinvested. Property returns include both appreciation and cumulative rental income.</p>
      </div>
    </div>
  );
}