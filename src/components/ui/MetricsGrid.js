import React, { useState, useEffect } from 'react';
import { analyzeWithCurrentValues, calculateCAGR, calculateEquityAtYear, calculateIRR } from '@/lib/finance';

export default function MetricsGrid({ properties }) {
  const [historicalData, setHistoricalData] = useState({});

  // Fetch historical actuals data for IRR and NPV calculations
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

  // Calculate real metrics from property data
  const calculateMetrics = () => {
    if (properties.length === 0) {
      return { avgIRR: 0, totalNPV: 0, portfolioCAGR: 0, totalCashFlow: 0 };
    }

    let validIRRs = [];
    let totalNPV = 0;
    let totalCashFlow = 0;
    let portfolioInitialInvestment = 0;
    let portfolioCurrentEquity = 0;
    const currentYear = 2025;

    properties.forEach(property => {
      const metrics = analyzeWithCurrentValues(property);
      
      // Add monthly cash flow
      totalCashFlow += metrics.cashflowMonthly;
      
      // For portfolio CAGR calculation
      const initialInvestment = Number(property.initial_investment) || 0;
      const currentMarketValue = Number(property.current_market_value) || Number(property.purchase_price) || 0;
      const currentEquity = calculateEquityAtYear(property, currentYear, currentMarketValue);
      
      portfolioInitialInvestment += initialInvestment;
      portfolioCurrentEquity += currentEquity;

      // Calculate IRR using historical data if available
      const propertyHistoricalData = historicalData[property.id] || [];
      const yearsOwned = property.year_purchased ? currentYear - property.year_purchased : 0;
      
      if (yearsOwned >= 2 && propertyHistoricalData.length > 0) {
        const cashFlows = [-initialInvestment]; // Initial investment as negative
        
        for (let year = property.year_purchased; year <= currentYear; year++) {
          const yearData = propertyHistoricalData.find(d => d.year === year);
          if (yearData) {
            // Use NOI instead of net income to exclude depreciation
            const noi = yearData.grossIncome - (yearData.totalExpenses - (yearData.depreciation || 0));
            cashFlows.push(noi);
          } else {
            // Estimate for missing years
            cashFlows.push(metrics.noiAnnual);
          }
        }
        
        // Add current equity to final cash flow
        if (cashFlows.length > 1) {
          cashFlows[cashFlows.length - 1] += currentEquity;
          const irr = calculateIRR(cashFlows);
          if (irr && !isNaN(irr) && isFinite(irr)) {
            validIRRs.push(irr);
          }
        }
      }

      // Simple NPV calculation (present value of equity minus initial investment)
      if (initialInvestment > 0) {
        totalNPV += currentEquity - initialInvestment;
      }
    });

    // Calculate averages
    const avgIRR = validIRRs.length > 0 ? validIRRs.reduce((a, b) => a + b, 0) / validIRRs.length : 0;
    
    // Portfolio CAGR (investment-weighted average, only purchased properties)
    const purchasedProperties = properties.filter(p => 
      p.purchased && 
      p.year_purchased && 
      p.year_purchased <= currentYear &&
      (Number(p.initial_investment) > 0 || Number(p.purchase_price) > 0)
    );
    
    let portfolioCAGR = 0;
    if (purchasedProperties.length > 0) {
      // Calculate investment-weighted average years owned
      let totalValidInvestment = 0;
      let weightedYearSum = 0;
      let totalValidEquity = 0;
      
      purchasedProperties.forEach(property => {
        const investment = Number(property.initial_investment) || 
          (Number(property.purchase_price) * ((Number(property.down_payment_pct) || 20) / 100));
        const yearsOwned = currentYear - property.year_purchased;
        const currentMarketValue = Number(property.current_market_value) || Number(property.purchase_price) || 0;
        const currentEquity = calculateEquityAtYear(property, currentYear, currentMarketValue);
        
        if (investment > 0 && yearsOwned > 0) {
          totalValidInvestment += investment;
          weightedYearSum += investment * yearsOwned;
          totalValidEquity += currentEquity;
        }
      });
      
      const weightedAverageYears = totalValidInvestment > 0 ? weightedYearSum / totalValidInvestment : 0;
      
      if (totalValidInvestment > 0 && weightedAverageYears > 0 && totalValidEquity > 0) {
        portfolioCAGR = calculateCAGR(totalValidInvestment, totalValidEquity, weightedAverageYears);
        // Cap extreme values
        if (!isFinite(portfolioCAGR) || portfolioCAGR > 100 || portfolioCAGR < -50) {
          portfolioCAGR = 0;
        }
      }
    }


    return {
      avgIRR: avgIRR || 0,
      totalNPV,
      portfolioCAGR,
      totalCashFlow
    };
  };

  const metrics = calculateMetrics();

  return (
    <div className="grid md:grid-cols-4 gap-6">
      <MetricCard 
        title="Avg IRR" 
        value={metrics.avgIRR !== 0 ? `${metrics.avgIRR.toFixed(1)}%` : 'N/A'} 
        subtitle="Internal Rate of Return"
      />
      <MetricCard 
        title="Total NPV" 
        value={`$${metrics.totalNPV.toLocaleString()}`}
        subtitle="Current Equity - Initial Investment"
      />
      <MetricCard 
        title="Portfolio CAGR" 
        value={metrics.portfolioCAGR !== 0 ? `${metrics.portfolioCAGR.toFixed(1)}%` : 'N/A'}
        subtitle="Compound Annual Growth Rate"
      />
      <MetricCard 
        title="Cash Flow" 
        value={`$${metrics.totalCashFlow.toLocaleString()}/mo`}
        subtitle="Total Monthly Net Cash Flow"
      />
    </div>
  );
}

function MetricCard({ title, value, subtitle }) {
  return (
    <div className="bg-white rounded-lg border p-4 text-center">
      <h3 className="text-sm font-medium text-gray-700 mb-1">{title}</h3>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}