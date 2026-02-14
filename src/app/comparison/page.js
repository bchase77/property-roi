'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import MetricsDefinitions from '@/components/ui/MetricsDefinitions';
import { analyzeWithCurrentValues } from '@/lib/finance';
import { mergePropertiesAndScenarios } from '@/lib/scenarioHelpers';

export default function ComparisonPage() {
  const [properties, setProperties] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('capRate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showOnlyProjected, setShowOnlyProjected] = useState(false);
  const [boldedRows, setBoldedRows] = useState(new Set());
  const [propertyOrder, setPropertyOrder] = useState([]);

  useEffect(() => {
    document.title = 'CP - Comparison';
  }, []);

  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties() {
    try {
      // Load properties
      const res = await fetch('/api/properties', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
        
        // Load all scenarios for all properties
        const scenarioPromises = data.map(async (property) => {
          try {
            const scenarioRes = await fetch(`/api/properties/${property.id}/scenarios`);
            if (scenarioRes.ok) {
              const scenarioData = await scenarioRes.json();
              return scenarioData.map(scenario => ({ ...scenario, property_id: property.id }));
            }
          } catch (error) {
            console.error(`Failed to load scenarios for property ${property.id}:`, error);
          }
          return [];
        });
        
        const allScenarios = (await Promise.all(scenarioPromises)).flat();
        setScenarios(allScenarios);
        
        // Initialize property order with merged properties and scenarios
        const allItems = mergePropertiesAndScenarios(data, allScenarios);
        setPropertyOrder(allItems.map(item => item.id));
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else if (sortDirection === 'asc') {
        // Clear sorting - go back to manual order
        setSortField(null);
        setSortDirection('desc');
      }
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '⬆️' : '⬇️';
  };

  const getColumnHeaderClass = (field) => {
    const baseClass = "text-right p-3 font-medium cursor-pointer hover:bg-gray-100";
    if (sortField === field) {
      return `${baseClass} bg-blue-200 text-blue-900 border-2 border-blue-400 shadow-sm`;
    }
    return `${baseClass} text-gray-900`;
  };

  const getColumnCellClass = (field, baseClass) => {
    if (sortField === field) {
      return `${baseClass} bg-blue-50 border-l-2 border-r-2 border-blue-300`;
    }
    return baseClass;
  };

  const toggleBold = (propertyId) => {
    setBoldedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(propertyId)) {
        newSet.delete(propertyId);
      } else {
        newSet.add(propertyId);
      }
      return newSet;
    });
  };

  const movePropertyUp = (propertyId) => {
    setPropertyOrder(prev => {
      const currentIndex = prev.indexOf(propertyId);
      if (currentIndex > 0) {
        const newOrder = [...prev];
        [newOrder[currentIndex - 1], newOrder[currentIndex]] = [newOrder[currentIndex], newOrder[currentIndex - 1]];
        return newOrder;
      }
      return prev;
    });
  };

  const movePropertyDown = (propertyId) => {
    setPropertyOrder(prev => {
      const currentIndex = prev.indexOf(propertyId);
      if (currentIndex < prev.length - 1) {
        const newOrder = [...prev];
        [newOrder[currentIndex], newOrder[currentIndex + 1]] = [newOrder[currentIndex + 1], newOrder[currentIndex]];
        return newOrder;
      }
      return prev;
    });
  };

  // Merge properties and scenarios for comparison
  const allItems = mergePropertiesAndScenarios(properties, scenarios);
  
  // Filter items
  const filteredProperties = allItems.filter(item => 
    showOnlyProjected ? !item.purchased : true
  );

  const sortedProperties = [...filteredProperties].sort((a, b) => {
    // If no specific sort is active, use custom property order
    if (!sortField) {
      const aIndex = propertyOrder.indexOf(a.id);
      const bIndex = propertyOrder.indexOf(b.id);
      return aIndex - bIndex;
    }
    const aMetrics = analyzeWithCurrentValues(a);
    const bMetrics = analyzeWithCurrentValues(b);
    
    let aValue, bValue;
    
    switch (sortField) {
      case 'address':
        aValue = a.address;
        bValue = b.address;
        break;
      case 'purchasePrice':
        aValue = Number(a.purchase_price) || 0;
        bValue = Number(b.purchase_price) || 0;
        break;
      case 'monthlyRent':
        aValue = Number(a.current_rent_monthly || a.monthly_rent) || 0;
        bValue = Number(b.current_rent_monthly || b.monthly_rent) || 0;
        break;
      case 'capRate':
        aValue = aMetrics.metrics.capRate;
        bValue = bMetrics.metrics.capRate;
        break;
      case 'cashOnCash':
        aValue = aMetrics.metrics.cashOnCash;
        bValue = bMetrics.metrics.cashOnCash;
        break;
      case 'grossYield':
        aValue = aMetrics.metrics.grossYield;
        bValue = bMetrics.metrics.grossYield;
        break;
      case 'atROI30y':
        aValue = aMetrics.metrics.atROI30y;
        bValue = bMetrics.metrics.atROI30y;
        break;
      case 'tri30y':
        aValue = aMetrics.metrics.tri30y;
        bValue = bMetrics.metrics.tri30y;
        break;
      case 'roi5y':
        aValue = aMetrics.metrics.roi5y;
        bValue = bMetrics.metrics.roi5y;
        break;
      case 'originalAtROI30y':
        aValue = aMetrics.metrics.originalAtROI30y;
        bValue = bMetrics.metrics.originalAtROI30y;
        break;
      case 'cashFlow':
        aValue = aMetrics.cashflowMonthly;
        bValue = bMetrics.cashflowMonthly;
        break;
      case 'dscr':
        aValue = a.mortgage_free ? Infinity : aMetrics.metrics.dscr;
        bValue = b.mortgage_free ? Infinity : bMetrics.metrics.dscr;
        break;
      case 'noiMonthly':
        aValue = aMetrics.noiMonthly;
        bValue = bMetrics.noiMonthly;
        break;
      case 'initialInvestment':
        aValue = Number(a.initial_investment) || (Number(a.purchase_price) * (Number(a.down_payment_pct) || 20) / 100);
        bValue = Number(b.initial_investment) || (Number(b.purchase_price) * (Number(b.down_payment_pct) || 20) / 100);
        break;
      default:
        return 0;
    }

    if (typeof aValue === 'string') {
      return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
    }

    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
  });

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercent = (value) => {
    return `${value.toFixed(2)}%`;
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <div className="text-center py-12">Loading properties...</div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-6">
      <PageHeader 
        title="Property Comparison"
        subtitle="Compare properties side-by-side with sortable metrics to identify the best investment opportunities"
        currentPage="/comparison"
      />

      {/* Controls */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={showOnlyProjected}
                onChange={(e) => setShowOnlyProjected(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">Show only projected investments</span>
            </label>
          </div>
          <div className="text-sm text-gray-600">
            Showing {sortedProperties.length} properties
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-center p-3 font-medium text-gray-900 w-20">
                  Controls
                </th>
                <th 
                  className={sortField === 'address' ? "text-left p-3 font-medium cursor-pointer hover:bg-gray-100 bg-blue-200 text-blue-900 border-2 border-blue-400 shadow-sm" : "text-left p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"}
                  onClick={() => handleSort('address')}
                >
                  Property {getSortIcon('address')}
                </th>
                <th 
                  className={getColumnHeaderClass('purchasePrice')}
                  onClick={() => handleSort('purchasePrice')}
                >
                  Price {getSortIcon('purchasePrice')}
                </th>
                <th 
                  className={getColumnHeaderClass('initialInvestment')}
                  onClick={() => handleSort('initialInvestment')}
                >
                  Investment {getSortIcon('initialInvestment')}
                </th>
                <th 
                  className={getColumnHeaderClass('capRate')}
                  onClick={() => handleSort('capRate')}
                >
                  Cap Rate {getSortIcon('capRate')}
                </th>
                <th 
                  className={getColumnHeaderClass('cashOnCash')}
                  onClick={() => handleSort('cashOnCash')}
                >
                  CoC {getSortIcon('cashOnCash')}
                </th>
                <th 
                  className={getColumnHeaderClass('grossYield')}
                  onClick={() => handleSort('grossYield')}
                >
                  Gross Yield {getSortIcon('grossYield')}
                </th>
                <th 
                  className={getColumnHeaderClass('atROI30y')}
                  onClick={() => handleSort('atROI30y')}
                >
                  30y ATROI {getSortIcon('atROI30y')}
                </th>
                <th 
                  className={getColumnHeaderClass('tri30y')}
                  onClick={() => handleSort('tri30y')}
                >
                  30y TRI {getSortIcon('tri30y')}
                </th>
                <th 
                  className={getColumnHeaderClass('roi5y')}
                  onClick={() => handleSort('roi5y')}
                >
                  5y ROI {getSortIcon('roi5y')}
                </th>
                <th 
                  className={getColumnHeaderClass('originalAtROI30y')}
                  onClick={() => handleSort('originalAtROI30y')}
                >
                  Orig 30y ATROI {getSortIcon('originalAtROI30y')}
                </th>
                <th
                  className={getColumnHeaderClass('dscr')}
                  onClick={() => handleSort('dscr')}
                >
                  DSCR {getSortIcon('dscr')}
                </th>
                <th
                  className={getColumnHeaderClass('noiMonthly')}
                  onClick={() => handleSort('noiMonthly')}
                >
                  NOI/mo {getSortIcon('noiMonthly')}
                </th>
                <th 
                  className={getColumnHeaderClass('cashFlow')}
                  onClick={() => handleSort('cashFlow')}
                >
                  Cash Flow {getSortIcon('cashFlow')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedProperties.map((property) => {
                const metrics = analyzeWithCurrentValues(property);
                const isOwned = property.purchased;
                const initialInvestment = Number(property.initial_investment) || 
                  (Number(property.purchase_price) * (Number(property.down_payment_pct) || 20) / 100);

                const isBold = boldedRows.has(property.id);

                return (
                  <tr 
                    key={property.id} 
                    className={`hover:bg-gray-50 ${isOwned ? 'bg-green-50' : ''} ${isBold ? 'bg-blue-50' : ''} ${property.isScenario ? 'bg-yellow-50 border-l-4 border-yellow-400' : ''}`}
                  >
                    <td className="p-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex gap-1">
                          <button
                            onClick={() => movePropertyUp(property.id)}
                            className="text-xs text-gray-500 hover:text-gray-700 p-1"
                            title="Move up"
                          >
                            ⬆️
                          </button>
                          <button
                            onClick={() => movePropertyDown(property.id)}
                            className="text-xs text-gray-500 hover:text-gray-700 p-1"
                            title="Move down"
                          >
                            ⬇️
                          </button>
                        </div>
                        <button
                          onClick={() => toggleBold(property.id)}
                          className={`text-xs px-2 py-1 rounded ${
                            isBold 
                              ? 'bg-blue-600 text-white' 
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                          title={isBold ? 'Unbold row' : 'Bold row'}
                        >
                          B
                        </button>
                      </div>
                    </td>
                    <td className={getColumnCellClass('address', "p-3")}>
                      <div className={`${isBold ? 'font-bold' : 'font-medium'} text-gray-900`}>
                        {property.isScenario ? (
                          <>
                            <span>{property.address.split(' (')[0]}</span>
                            <span className="ml-2 text-sm bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">
                              📊 {property.scenarioName}
                            </span>
                          </>
                        ) : (
                          property.address
                        )}
                      </div>
                      <div className={`text-xs text-gray-500 ${isBold ? 'font-bold' : ''}`}>
                        {property.abbreviation && `(${property.abbreviation}) `}
                        {property.city}, {property.state}
                        {property.isScenario && (
                          <span className="ml-2 text-yellow-600 font-medium">
                            {property.down_payment_pct}% down, {property.interest_apr_pct}% APR, {property.loan_years}y
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={getColumnCellClass('purchasePrice', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'}`)}>
                      <span className="text-black">{formatCurrency(property.purchase_price)}</span>
                    </td>
                    <td className={getColumnCellClass('initialInvestment', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'}`)}>
                      <span className="text-black">{formatCurrency(initialInvestment)}</span>
                    </td>
                    <td className={getColumnCellClass('capRate', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.metrics.capRate >= 6 ? 'text-green-600' : 
                      metrics.metrics.capRate >= 4 ? 'text-yellow-600' : 'text-red-600'
                    }`)}>
                      {formatPercent(metrics.metrics.capRate)}
                    </td>
                    <td className={getColumnCellClass('cashOnCash', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.metrics.cashOnCash >= 8 ? 'text-green-600' : 
                      metrics.metrics.cashOnCash >= 5 ? 'text-yellow-600' : 'text-red-600'
                    }`)}>
                      {formatPercent(metrics.metrics.cashOnCash)}
                    </td>
                    <td className={getColumnCellClass('grossYield', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.metrics.grossYield >= 8 ? 'text-green-600' : 
                      metrics.metrics.grossYield >= 6 ? 'text-yellow-600' : 'text-red-600'
                    }`)}>
                      {formatPercent(metrics.metrics.grossYield)}
                    </td>
                    <td className={getColumnCellClass('atROI30y', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.metrics.atROI30y >= 10 ? 'text-green-600' : 
                      metrics.metrics.atROI30y >= 7 ? 'text-yellow-600' : 'text-red-600'
                    }`)}>
                      {formatPercent(metrics.metrics.atROI30y)}
                    </td>
                    <td className={getColumnCellClass('tri30y', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.metrics.tri30y >= 8 ? 'text-green-600' : 
                      metrics.metrics.tri30y >= 6 ? 'text-yellow-600' : 'text-red-600'
                    }`)}>
                      {formatPercent(metrics.metrics.tri30y)}
                    </td>
                    <td className={getColumnCellClass('roi5y', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.metrics.roi5y >= 10 ? 'text-green-600' : 
                      metrics.metrics.roi5y >= 7 ? 'text-yellow-600' : 'text-red-600'
                    }`)}>
                      {formatPercent(metrics.metrics.roi5y)}
                    </td>
                    <td className={getColumnCellClass('originalAtROI30y', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.metrics.originalAtROI30y >= 10 ? 'text-blue-600' : 
                      metrics.metrics.originalAtROI30y >= 7 ? 'text-blue-500' : 'text-blue-400'
                    }`)}>
                      {formatPercent(metrics.metrics.originalAtROI30y)}
                      {metrics.metrics.originalAtROI30y !== metrics.metrics.atROI30y && (
                        <div className={`text-xs text-gray-500 ${isBold ? 'font-bold' : ''}`}>
                          Δ{(metrics.metrics.atROI30y - metrics.metrics.originalAtROI30y) >= 0 ? '+' : ''}{(metrics.metrics.atROI30y - metrics.metrics.originalAtROI30y).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className={getColumnCellClass('dscr', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      property.mortgage_free ? 'text-gray-400' :
                      metrics.metrics.dscr >= 1.25 ? 'text-green-600' :
                      metrics.metrics.dscr >= 1.0 ? 'text-yellow-600' : 'text-red-600'
                    }`)}>
                      {property.mortgage_free ? 'N/A' : metrics.metrics.dscr.toFixed(2)}
                    </td>
                    <td className={getColumnCellClass('noiMonthly', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.noiMonthly >= 0 ? 'text-green-600' : 'text-red-600'
                    }`)}>
                      {formatCurrency(metrics.noiMonthly)}
                    </td>
                    <td className={getColumnCellClass('cashFlow', `p-3 text-right ${isBold ? 'font-bold' : 'font-medium'} ${
                      metrics.cashflowMonthly >= 0 ? 'text-green-600' : 'text-red-600'
                    }`)}>
                      {formatCurrency(metrics.cashflowMonthly)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {sortedProperties.length === 0 && (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500 mb-4">No properties found</p>
          <a 
            href="/data-entry" 
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            Add your first property →
          </a>
        </div>
      )}

      {/* Legend */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Color Legend</h3>
        
        {/* Financial Metrics Legend */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Financial Metrics</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="flex items-center gap-2 text-gray-900">
              <div className="w-3 h-3 bg-green-600 rounded"></div>
              <span>Excellent (Cap ≥6%, CoC ≥8%, Yield ≥8%, 30y ATROI ≥10%, 30y TRI ≥8%, 5y ROI ≥10%)</span>
            </div>
            <div className="flex items-center gap-2 text-gray-900">
              <div className="w-3 h-3 bg-yellow-600 rounded"></div>
              <span>Good (Cap 4-6%, CoC 5-8%, Yield 6-8%, 30y ATROI 7-10%, 30y TRI 6-8%, 5y ROI 7-10%)</span>
            </div>
            <div className="flex items-center gap-2 text-gray-900">
              <div className="w-3 h-3 bg-red-600 rounded"></div>
              <span>Below Target</span>
            </div>
          </div>
        </div>


        {/* Property Status Legend */}
        <div>
          <h4 className="text-xs font-medium text-gray-700 mb-2">Property Status</h4>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-100 border border-green-200 rounded"></div>
              <span>Owned Properties</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded"></div>
              <span>Projected Investments</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-100 border-l-4 border-yellow-400 rounded"></div>
              <span>Scenarios (Alternative financing)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Metrics Definitions */}
      <MetricsDefinitions />
    </main>
  );
}