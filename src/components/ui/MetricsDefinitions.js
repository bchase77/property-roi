'use client';
import { useState } from 'react';

export default function MetricsDefinitions({ 
  isFloating = false, 
  onClose = null, 
  className = "" 
}) {
  const [isExpanded, setIsExpanded] = useState(!isFloating);

  const definitions = {
    "Financial Metrics": [
      {
        term: "Cap Rate (Capitalization Rate)",
        formula: "Annual NOI ÷ Purchase Price × 100",
        description: "Return on total property value, regardless of financing. Higher is better.",
        target: "Target: ≥6%",
        example: "If NOI = $6,000/year and purchase price = $100,000, Cap Rate = 6%"
      },
      {
        term: "Cash-on-Cash Return (CoC)",
        formula: "Annual Cash Flow ÷ Cash Invested × 100",
        description: "Return on actual cash you invested (down payment + closing costs + repairs). Excludes appreciation.",
        target: "Target: ≥8%",
        example: "If annual cash flow = $2,400 and you invested $30,000, CoC = 8%"
      },
      {
        term: "30y ATROI (Average Total ROI)",
        formula: "(Total Value - Total Expenses) ÷ Amount Paid ÷ 30 years × 100",
        description: "Your conservative formula without appreciation or inflation. Includes 30 years of income, expenses, and theoretical mortgage payments.",
        target: "Target: ≥10%",
        example: "Conservative long-term return analysis over 30 years",
        note: "📅 icon indicates using original purchase-time values vs current market assumptions"
      },
      {
        term: "30y TRI (Total Return Investment)", 
        formula: "Comprehensive analysis with inflation, appreciation, and tax treatment",
        description: "Advanced calculation including 3% appreciation, 2.5% rent growth, depreciation benefits, and full tax treatment (44% income, 25% recapture, 15% capital gains).",
        target: "Target: ≥6-8%",
        example: "Conservative but sophisticated analysis: with built-in 3% appreciation and tax benefits, 6-8% is realistic"
      },
      {
        term: "Gross Yield",
        formula: "Annual Rent ÷ Purchase Price × 100",
        description: "Simple rental yield before any expenses. Quick screening metric.",
        target: "Target: 8-12%",
        example: "If annual rent = $12,000 and purchase price = $100,000, Gross Yield = 12%"
      },
      {
        term: "NOI (Net Operating Income)",
        formula: "Annual Rent - Operating Expenses (excludes mortgage payments)",
        description: "Property's earning power independent of financing. Used for Cap Rate calculation.",
        target: "Higher is better",
        example: "Gross rent minus taxes, insurance, maintenance, vacancy, management"
      },
      {
        term: "Cash Flow",
        formula: "Monthly NOI - Mortgage Payment (P&I)",
        description: "Actual monthly cash in your pocket after all expenses and debt service.",
        target: "Positive preferred",
        example: "The real money you receive or pay each month"
      }
    ],
    "Advanced Analysis": [
      {
        term: "Market Cap Rate",
        formula: "NOI ÷ Current Market Value × 100",
        description: "What you're earning on the asset at today's market value.",
        target: "Compare to purchase cap rate",
        example: "Shows if property has appreciated beyond rental income growth"
      },
      {
        term: "Purchase Cap Rate", 
        formula: "NOI ÷ Original Purchase Price × 100",
        description: "Return on total property value based on what you originally paid.",
        target: "Track performance over time",
        example: "Your actual return based on purchase price, not current value"
      },
      {
        term: "CAGR (Compound Annual Growth Rate)",
        formula: "(Ending Value ÷ Beginning Value)^(1/years) - 1",
        description: "Annualized growth rate from initial investment to current equity value. Includes appreciation but excludes cash flow.",
        target: "Compare to market returns",
        example: "How your equity has grown annually due to appreciation and loan paydown"
      },
      {
        term: "Cash-on-Equity",
        formula: "Annual Cash Flow ÷ Current Equity × 100",
        description: "Return on current equity value. Used for hold vs sell analysis.",
        target: "Compare to market alternatives",
        example: "What you're earning on the equity tied up in the property today"
      },
      {
        term: "vs S&P 500",
        formula: "Property CAGR - S&P 500 Historical Return",
        description: "How your property appreciation compares to actual S&P 500 returns from your purchase date.",
        target: "Positive is better",
        example: "Shows if real estate outperformed the stock market"
      }
    ],
    "Investment Analysis": [
      {
        term: "Original 30y ATROI",
        formula: "Historical purchase-time 30y ATROI calculation",
        description: "The 30y ATROI using your original assumptions at purchase time (original rent, rates, etc.)",
        target: "Compare to current calculation",
        example: "What you projected when you bought vs what current numbers show"
      },
      {
        term: "Hold vs Sell Recommendation",
        formula: "Market Return (10%) - Cash-on-Equity Return",
        description: "Compares your current return to market alternatives.",
        target: "Hold: gap ≤2%, Review: gap 2-5%, Consider Selling: gap >5%",
        example: "If Cash-on-Equity = 4% and market = 10%, gap = 6% → Consider Selling"
      },
      {
        term: "Property Total Value",
        formula: "Current Market Value + Total Cash Flows Received",
        description: "Complete property value including appreciation and all cash received over ownership period.",
        target: "Compare to S&P 500 equivalent",
        example: "Total return including both appreciation and cash flow"
      }
    ],
    "Safety & Risk": [
      {
        term: "Crime Index",
        formula: "1-10 scale based on local crime statistics",
        description: "Neighborhood safety assessment using government crime data.",
        target: "1-3: Low (Safe), 4-6: Moderate, 7-10: High (Caution)",
        example: "Affects desirability, tenant quality, and long-term appreciation"
      },
      {
        term: "DSCR (Debt Service Coverage Ratio)",
        formula: "NOI ÷ Monthly Mortgage Payment",
        description: "How well the property covers its mortgage payment.",
        target: "≥1.25 preferred",
        example: "If NOI = $1,500/mo and payment = $1,200/mo, DSCR = 1.25"
      }
    ]
  };

  if (isFloating) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <div className="fixed inset-0 bg-black bg-opacity-25" onClick={onClose}></div>
          <div className="relative bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Real Estate Investment Metrics</h2>
              <button 
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <DefinitionsContent definitions={definitions} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <section className={`bg-white rounded-lg border p-6 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold text-gray-900">Metrics Definitions</h2>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-blue-600 hover:text-blue-800 text-sm font-medium"
        >
          {isExpanded ? 'Hide Definitions' : 'Show Definitions'}
        </button>
      </div>
      
      {isExpanded && <DefinitionsContent definitions={definitions} />}
    </section>
  );
}

function DefinitionsContent({ definitions }) {
  return (
    <div className="space-y-6">
      {Object.entries(definitions).map(([category, metrics]) => (
        <div key={category}>
          <h3 className="text-lg font-semibold text-gray-800 mb-3 border-b pb-2">
            {category}
          </h3>
          <div className="space-y-4">
            {metrics.map((metric, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">{metric.term}</h4>
                  {metric.target && (
                    <span className="text-sm text-blue-600 font-medium">{metric.target}</span>
                  )}
                </div>
                <div className="space-y-2 text-sm text-gray-700">
                  <div><strong>Formula:</strong> {metric.formula}</div>
                  <div><strong>Description:</strong> {metric.description}</div>
                  {metric.example && (
                    <div><strong>Example:</strong> {metric.example}</div>
                  )}
                  {metric.note && (
                    <div className="text-blue-600 bg-blue-50 p-2 rounded border border-blue-200">
                      <strong>Note:</strong> {metric.note}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h4 className="font-semibold text-yellow-900 mb-2">Formula Consistency</h4>
        <div className="text-sm text-yellow-800 space-y-1">
          <div>• All calculations use the same formulas across Portfolio, Comparison, and Analysis pages</div>
          <div>• Current vs Original values: Some metrics show historical purchase-time assumptions (marked with 📅)</div>
          <div>• Color coding: Green = Excellent, Yellow = Good, Red = Below Target</div>
          <div>• Empty fields default to 0 in calculations to prevent errors</div>
        </div>
      </div>
    </div>
  );
}