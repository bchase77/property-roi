import React, { useState, useMemo, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { calculateEquityAtYear, analyzeWithCurrentValues, mortgageMonthly } from '@/lib/finance';
import { getPropertyDisplayLabel } from '@/lib/propertyDisplay';
import { mergePropertiesAndScenarios } from '@/lib/scenarioHelpers';

export default function AssetValueChart({ properties = [], scenarios = [], onRefreshData, isPopout = false }) {
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
  const [historicalData, setHistoricalData] = useState({});
  
  // State for cash purchase scenarios
  const [showCashPurchase, setShowCashPurchase] = useState(false);
  const [hoveredLine, setHoveredLine] = useState(null);
  
  // Merge properties and scenarios into combined list for processing
  const allProperties = useMemo(() => mergePropertiesAndScenarios(properties, scenarios, showCashPurchase), [properties, scenarios, showCashPurchase]);
  
  // Fetch historical data for properties with yearly data
  useEffect(() => {
    const fetchHistoricalData = async () => {
      const historicalDataMap = {};
      
      for (const property of properties) {
        if (property.purchased) {
          try {
            const response = await fetch(`/api/properties/${property.id}/years`);
            if (response.ok) {
              const yearlyData = await response.json();
              if (yearlyData && yearlyData.length > 0) {
                historicalDataMap[property.id] = yearlyData;
              }
            }
          } catch (error) {
            console.error(`Failed to fetch historical data for property ${property.id}:`, error);
          }
        }
      }
      
      setHistoricalData(historicalDataMap);
    };
    
    if (properties.length > 0) {
      fetchHistoricalData();
    }
  }, [properties]);
  
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

  // Helper functions for extrapolation
  const calculateIncomeGrowthRate = (yearlyData, property) => {
    if (!yearlyData || yearlyData.length < 2) return 0.025; // Default 2.5% if insufficient data
    
    const sortedData = yearlyData.filter(d => d.income && Number(d.income) > 0).sort((a, b) => a.year - b.year);
    if (sortedData.length < 2) return 0.025;
    
    // Adjust first year if it's a partial year (purchased mid-year)
    let adjustedData = [...sortedData];
    const purchaseYear = property.year_purchased;
    const purchaseMonth = property.month_purchased;
    
    if (purchaseMonth && purchaseMonth > 1 && sortedData[0].year === purchaseYear) {
      // Extrapolate partial year to full year
      const monthsOwned = 13 - purchaseMonth; // Months remaining in year after purchase
      const annualizedIncome = (Number(sortedData[0].income) * 12) / monthsOwned;
      adjustedData[0] = { ...sortedData[0], income: annualizedIncome };
    }
    
    // Use recent trend if we have enough data (last 5-7 years)
    const recentYears = adjustedData.slice(-Math.min(7, adjustedData.length));
    
    if (recentYears.length >= 3) {
      // Calculate average year-over-year growth for recent years
      let totalGrowth = 0;
      let validYears = 0;
      
      for (let i = 1; i < recentYears.length; i++) {
        const prevIncome = Number(recentYears[i-1].income);
        const currIncome = Number(recentYears[i].income);
        
        if (prevIncome > 0) {
          const yearGrowth = (currIncome - prevIncome) / prevIncome;
          totalGrowth += yearGrowth;
          validYears++;
        }
      }
      
      if (validYears > 0) {
        const avgGrowthRate = totalGrowth / validYears;
        // Cap growth rate between -5% and 15%
        return Math.max(-0.05, Math.min(0.15, avgGrowthRate));
      }
    }
    
    // Fallback to CAGR if recent trend calculation fails
    const firstYear = adjustedData[0];
    const lastYear = adjustedData[adjustedData.length - 1];
    const yearsDiff = lastYear.year - firstYear.year;
    
    if (yearsDiff === 0) return 0.025;
    
    const growthRate = (Number(lastYear.income) / Number(firstYear.income)) ** (1 / yearsDiff) - 1;
    return Math.max(-0.05, Math.min(0.15, growthRate));
  };

  const calculateExpenseGrowthRate = (yearlyData, property) => {
    if (!yearlyData || yearlyData.length < 2) return 0.025; // Default 2.5% if insufficient data
    
    const sortedData = yearlyData.filter(d => d.expenses && Number(d.expenses) > 0).sort((a, b) => a.year - b.year);
    if (sortedData.length < 2) return 0.025;
    
    // Adjust first year if it's a partial year (purchased mid-year)
    let adjustedData = [...sortedData];
    const purchaseYear = property.year_purchased;
    const purchaseMonth = property.month_purchased;
    
    if (purchaseMonth && purchaseMonth > 1 && sortedData[0].year === purchaseYear) {
      // Extrapolate partial year to full year
      const monthsOwned = 13 - purchaseMonth; // Months remaining in year after purchase
      const annualizedExpenses = (Number(sortedData[0].expenses) * 12) / monthsOwned;
      adjustedData[0] = { ...sortedData[0], expenses: annualizedExpenses };
    }
    
    // Use recent trend if we have enough data (last 5-7 years)
    const recentYears = adjustedData.slice(-Math.min(7, adjustedData.length));
    
    if (recentYears.length >= 3) {
      // Calculate average year-over-year growth for recent years
      let totalGrowth = 0;
      let validYears = 0;
      
      for (let i = 1; i < recentYears.length; i++) {
        const prevExpenses = Number(recentYears[i-1].expenses);
        const currExpenses = Number(recentYears[i].expenses);
        
        if (prevExpenses > 0) {
          const yearGrowth = (currExpenses - prevExpenses) / prevExpenses;
          totalGrowth += yearGrowth;
          validYears++;
        }
      }
      
      if (validYears > 0) {
        const avgGrowthRate = totalGrowth / validYears;
        // Cap growth rate between -5% and 15%
        return Math.max(-0.05, Math.min(0.15, avgGrowthRate));
      }
    }
    
    // Fallback to CAGR if recent trend calculation fails
    const firstYear = adjustedData[0];
    const lastYear = adjustedData[adjustedData.length - 1];
    const yearsDiff = lastYear.year - firstYear.year;
    
    if (yearsDiff === 0) return 0.025;
    
    const growthRate = (Number(lastYear.expenses) / Number(firstYear.expenses)) ** (1 / yearsDiff) - 1;
    return Math.max(-0.05, Math.min(0.15, growthRate));
  };

  // Calculate time range
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

  // Stable chart data generation
  const chartData = useMemo(() => {
    
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
          
          // Calculate cumulative net cash flow using historical data when available
          let cumulativeNetCashFlow = 0;
          const propertyHistoricalData = historicalData[property.id];
          
          if (isPurchased && propertyHistoricalData && propertyHistoricalData.length > 0) {
            // Use actual historical data and extrapolate for future years
            
            // Calculate historical cash flows up to current year
            for (let histYear = purchaseYear; histYear <= Math.min(year, currentYear); histYear++) {
              const yearData = propertyHistoricalData.find(d => d.year === histYear);
              if (yearData) {
                const annualNetCashFlow = Number(yearData.income || 0) - Number(yearData.expenses || 0);
                cumulativeNetCashFlow += annualNetCashFlow;
              }
            }
            
            // For future years, extrapolate based on historical trends
            if (year > currentYear) {
              const incomeGrowthRate = calculateIncomeGrowthRate(propertyHistoricalData, property);
              const expenseGrowthRate = calculateExpenseGrowthRate(propertyHistoricalData, property);
              
              // Get most recent year's data as baseline
              const latestData = propertyHistoricalData.reduce((latest, data) => 
                data.year > latest.year ? data : latest
              );
              
              let projectedIncome = Number(latestData.income || 0);
              let projectedExpenses = Number(latestData.expenses || 0);
              
              // Project each future year
              for (let futureYear = currentYear + 1; futureYear <= year; futureYear++) {
                const yearsFromLatest = futureYear - latestData.year;
                projectedIncome = Number(latestData.income || 0) * Math.pow(1 + incomeGrowthRate, yearsFromLatest);
                projectedExpenses = Number(latestData.expenses || 0) * Math.pow(1 + expenseGrowthRate, yearsFromLatest);
                
                const projectedNetCashFlow = projectedIncome - projectedExpenses;
                cumulativeNetCashFlow += projectedNetCashFlow;
              }
            }
          } else {
            // Fallback to current NOI projection for properties without historical data
            const yearsOfIncome = isPurchased ? Math.max(0, year - purchaseYear) : Math.max(0, year - currentYear);
            
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
    
    // Filter out data points that have no property data
    const filteredData = data.filter(dataPoint => {
      // Keep data point if it has any property values (other than just the year)
      return Object.keys(dataPoint).length > 1;
    });
    
    return filteredData;
  }, [allProperties, timeRange, visibleProperties, refreshKey, historicalData, startYear, endYear]);

  // Reset auto-fit when view mode or data changes, but not when toggling property visibility
  useEffect(() => {
    if (autoFit) {
      setAutoFit(false);
      setYAxisDomain(['dataMin', 'dataMax']);
      setXAxisDomain(['dataMin', 'dataMax']);
    }
  }, [viewMode, historicalData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate auto-fit when properties are toggled
  useEffect(() => {
    if (autoFit) {
      calculateAutoFit();
    }
  }, [visibleProperties, showUnpurchased]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const refreshChart = async () => {
    // Refresh property data from database if function is provided
    if (onRefreshData) {
      await onRefreshData();
    }
    // Then refresh chart calculations
    setRefreshKey(prev => prev + 1);
  };

  const popOutChart = () => {
    // Open chart in new window using dedicated route
    const popoutUrl = '/charts/asset-value';
    const popoutWindow = window.open(
      popoutUrl, 
      'AssetValueChart', 
      'width=1400,height=900,scrollbars=yes,resizable=yes,toolbar=no,location=no,status=no'
    );
    
    if (!popoutWindow) {
      alert('Please allow pop-ups for this site to use the chart pop-out feature.');
      return;
    }

    // Focus the new window
    popoutWindow.focus();
  };

  const colors = ['#8884d8', '#82ca9d', '#a82222', '#ff7300', '#00ff00', '#ff00ff'];

  return (
    <div className={`bg-white rounded-lg border p-6 ${isPopout ? 'flex flex-col h-full' : ''}`}>
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
          {!isPopout && (
            <button
              onClick={popOutChart}
              className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
              title="Open chart in new window"
            >
              <span>🔗</span>
              <span>Pop Out</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
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
            
            <label className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={showCashPurchase}
                onChange={(e) => setShowCashPurchase(e.target.checked)}
                className="w-3 h-3"
              />
              <span className="text-gray-600">Cash Purchase Scenarios</span>
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
          <div className="flex flex-wrap gap-1">
            {allProperties.map((property, index) => {
              const isPurchased = Boolean(property.purchased);
              const isCashPurchase = property.isCashPurchaseScenario;
              if (!isPurchased && !showUnpurchased) return null;
              
              return (
                <button
                  key={property.id}
                  onClick={() => toggleProperty(property.id)}
                  onMouseEnter={() => setHoveredLine(`${getPropertyDisplayLabel(property)}_${viewMode}`)}
                  onMouseLeave={() => setHoveredLine(null)}
                  className={`px-1 py-0.5 text-xs rounded transition-all ${
                    hoveredLine === `${getPropertyDisplayLabel(property)}_${viewMode}` 
                      ? 'ring-2 ring-blue-400 shadow-md transform scale-105'
                      : ''
                  } ${
                    visibleProperties[property.id]
                      ? (isPurchased 
                          ? 'bg-blue-100 text-blue-800' 
                          : isCashPurchase 
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-orange-100 text-orange-800')
                      : 'bg-gray-100 text-gray-500'
                  }`}
                  style={{
                    borderLeftWidth: '3px',
                    borderLeftStyle: 'solid',
                    borderLeftColor: colors[index % colors.length]
                  }}
                  title={`${getPropertyDisplayLabel(property)} - Click to toggle, hover to highlight on chart`}
                >
                  {getPropertyDisplayLabel(property)}{!isPurchased ? (isCashPurchase ? ' 💰' : '') : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      
      <div className={isPopout ? "flex-1 min-h-0" : "h-80"}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="year" 
              domain={autoFit ? xAxisDomain : [startYear, endYear]}
              type="number"
              scale="linear"
            />
            <YAxis 
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
              domain={autoFit ? yAxisDomain : [0, 'dataMax']}
              type="number"
            />
            <Tooltip 
              content={({ active, payload, label }) => {
                if (!active || !payload || payload.length === 0 || !hoveredLine) return null;
                
                // Filter out empty name entries (invisible hover lines)
                const validPayload = payload.filter(item => item.name && item.name.trim() !== '');
                if (validPayload.length === 0) return null;
                
                // Find the payload item that matches the currently hovered line
                let targetItem = null;
                
                // Extract property name from hoveredLine (e.g., "5617 BlkM_market" -> "5617 BlkM")
                const propertyFromHover = hoveredLine.split('_')[0];
                
                // Look for payload item that matches the hovered property
                // First pass: look for visible lines (ones with proper names like "Property - Type")
                for (const item of validPayload) {
                  const itemKey = item.dataKey || '';
                  const itemName = item.name || '';
                  
                  // Check if this item's dataKey belongs to the hovered property
                  if (itemKey.startsWith(propertyFromHover)) {
                    // Also check if it matches the line type (equity vs value, with/without income)
                    const isIncomeHover = hoveredLine.includes('_income');
                    const isIncomeItem = itemKey.includes('_plus_income');
                    
                    if (isIncomeHover === isIncomeItem) {
                      // Prefer items with proper names (visible lines) over dataKey-only names (invisible lines)
                      if (itemName.includes(' - ') && (itemName.includes('Value') || itemName.includes('Equity') || itemName.includes('Cash'))) {
                        targetItem = item;
                        break;
                      } else if (!targetItem) {
                        // Use as fallback if no visible line found
                        targetItem = item;
                      }
                    }
                  }
                }
                
                if (!targetItem) return null;
                
                const name = targetItem.name || '';
                
                // Extract property info from the line name
                const isProjected = name.includes('(Projected)');
                const isCashPurchase = name.includes('Cash Purchase');
                const lineType = name.includes('Val+Cash') || name.includes('Eq+Cash') ? 
                  (viewMode === 'equity' ? 'Equity + Cash Flow' : 'Value + Cash Flow') :
                  (viewMode === 'equity' ? 'Equity Only' : 'Market Value');
                
                // Extract clean property name from the line name
                let cleanName = name;
                
                // Remove the suffix pattern: " - (Equity|Value|Eq+Cash|Val+Cash)"
                cleanName = cleanName.replace(/ - (Equity|Value|Eq\+Cash|Val\+Cash)$/, '');
                // Remove " (Projected)" if present
                cleanName = cleanName.replace(/ \(Projected\)$/, '');
                cleanName = cleanName.trim();
                
                // If still empty, use the property name from hoveredLine as fallback
                if (!cleanName || cleanName === '') {
                  cleanName = propertyFromHover;
                }
                
                // If cleanName is still empty, try a different approach - split on " - " and take first part
                if (!cleanName || cleanName === '') {
                  const parts = name.split(' - ');
                  if (parts.length > 0) {
                    cleanName = parts[0].replace(/ \(Projected\)$/, '').trim();
                  }
                }
                
                return (
                  <div style={{
                    backgroundColor: 'white',
                    border: '2px solid #3b82f6',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    color: '#333',
                    fontSize: '12px',
                    fontWeight: '500',
                    padding: '12px',
                    minWidth: '200px'
                  }}>
                    <div style={{ fontWeight: 'bold', fontSize: '14px', marginBottom: '8px', color: '#1f2937' }}>
                      📅 Year: {label}
                    </div>
                    <div style={{ marginBottom: '4px' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '2px', color: targetItem.stroke }}>
                        {cleanName}
                      </div>
                      <div style={{ fontSize: '11px', color: '#666', marginBottom: '6px' }}>
                        {lineType}
                        {isProjected && ' (Projected)'}
                        {isCashPurchase && ' 💰'}
                      </div>
                      <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#059669' }}>
                        ${targetItem.value?.toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              }}
              cursor={{
                stroke: '#3b82f6',
                strokeWidth: 2,
                strokeDasharray: '5 5'
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
                      <>
                        {/* Invisible wider line for better hover detection */}
                        <Line
                          type="monotone"
                          dataKey={viewMode === 'equity' ? `${displayLabel}_equity` : `${displayLabel}_value`}
                          stroke="transparent"
                          strokeWidth={8}
                          name=""
                          connectNulls={false}
                          onMouseEnter={() => setHoveredLine(`${displayLabel}_${viewMode}`)}
                          onMouseLeave={() => setHoveredLine(null)}
                          dot={false}
                          activeDot={false}
                        />
                        {/* Visible line */}
                        <Line
                          type="monotone"
                          dataKey={viewMode === 'equity' ? `${displayLabel}_equity` : `${displayLabel}_value`}
                          stroke={color}
                          strokeWidth={hoveredLine === `${displayLabel}_${viewMode}` ? 4 : 2}
                          strokeOpacity={hoveredLine && hoveredLine !== `${displayLabel}_${viewMode}` ? 0.3 : 1}
                          strokeDasharray={strokeDashArray}
                          name={`${displayLabel}${isPurchased ? '' : ' (Projected)'} - ${viewMode === 'equity' ? 'Equity' : 'Value'}`}
                          connectNulls={false}
                          dot={hoveredLine === `${displayLabel}_${viewMode}` ? { fill: color, strokeWidth: 2, r: 4 } : false}
                          activeDot={false}
                        />
                      </>
                    )}
                    {showIncomeLines && (
                      <>
                        {/* Invisible wider line for better hover detection */}
                        <Line
                          type="monotone"
                          dataKey={viewMode === 'equity' ? `${displayLabel}_equity_plus_income` : `${displayLabel}_value_plus_income`}
                          stroke="transparent"
                          strokeWidth={8}
                          name=""
                          connectNulls={false}
                          onMouseEnter={() => setHoveredLine(`${displayLabel}_${viewMode}_income`)}
                          onMouseLeave={() => setHoveredLine(null)}
                          dot={false}
                          activeDot={false}
                        />
                        {/* Visible line */}
                        <Line
                          type="monotone"
                          dataKey={viewMode === 'equity' ? `${displayLabel}_equity_plus_income` : `${displayLabel}_value_plus_income`}
                          stroke={color}
                          strokeWidth={hoveredLine === `${displayLabel}_${viewMode}_income` ? 4 : 2}
                          strokeOpacity={hoveredLine && hoveredLine !== `${displayLabel}_${viewMode}_income` ? 0.3 : 1}
                          strokeDasharray={isPurchased ? "5 5" : "3 3"}
                          name={`${displayLabel}${isPurchased ? '' : ' (Projected)'} - ${viewMode === 'equity' ? 'Eq+Cash' : 'Val+Cash'}`}
                          connectNulls={false}
                          dot={hoveredLine === `${displayLabel}_${viewMode}_income` ? { fill: color, strokeWidth: 2, r: 4 } : false}
                          activeDot={false}
                        />
                      </>
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