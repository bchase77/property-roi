'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import MetricsDefinitions from '@/components/ui/MetricsDefinitions';
import { analyzeWithCurrentValues } from '@/lib/finance';
import { formatCrimeIndex } from '@/lib/crime';

export default function ComparisonPage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('capRate');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showOnlyProjected, setShowOnlyProjected] = useState(false);

  useEffect(() => {
    document.title = 'Property Comparison';
  }, []);

  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties() {
    try {
      const res = await fetch('/api/properties', { cache: 'no-store' });
      if (res.ok) {
        setProperties(await res.json());
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) return '↕️';
    return sortDirection === 'asc' ? '⬆️' : '⬇️';
  };

  // Filter and sort properties
  const filteredProperties = properties.filter(property => 
    showOnlyProjected ? !property.purchased : true
  );

  const sortedProperties = [...filteredProperties].sort((a, b) => {
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
      case 'originalAtROI30y':
        aValue = aMetrics.metrics.originalAtROI30y;
        bValue = bMetrics.metrics.originalAtROI30y;
        break;
      case 'cashFlow':
        aValue = aMetrics.cashflowMonthly;
        bValue = bMetrics.cashflowMonthly;
        break;
      case 'noiMonthly':
        aValue = aMetrics.noiMonthly;
        bValue = bMetrics.noiMonthly;
        break;
      case 'initialInvestment':
        aValue = Number(a.initial_investment) || (Number(a.purchase_price) * (Number(a.down_payment_pct) || 20) / 100);
        bValue = Number(b.initial_investment) || (Number(b.purchase_price) * (Number(b.down_payment_pct) || 20) / 100);
        break;
      case 'crimeIndex':
        aValue = Number(a.crime_index) || 99; // Default to high crime if no data
        bValue = Number(b.crime_index) || 99;
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
                <th 
                  className="text-left p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('address')}
                >
                  Property {getSortIcon('address')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('purchasePrice')}
                >
                  Price {getSortIcon('purchasePrice')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('initialInvestment')}
                >
                  Investment {getSortIcon('initialInvestment')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('capRate')}
                >
                  Cap Rate {getSortIcon('capRate')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('cashOnCash')}
                >
                  CoC {getSortIcon('cashOnCash')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('grossYield')}
                >
                  Gross Yield {getSortIcon('grossYield')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('atROI30y')}
                >
                  30y ATROI {getSortIcon('atROI30y')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('tri30y')}
                >
                  30y TRI {getSortIcon('tri30y')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('originalAtROI30y')}
                >
                  Orig 30y ATROI {getSortIcon('originalAtROI30y')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('noiMonthly')}
                >
                  NOI/mo {getSortIcon('noiMonthly')}
                </th>
                <th 
                  className="text-right p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('cashFlow')}
                >
                  Cash Flow {getSortIcon('cashFlow')}
                </th>
                <th 
                  className="text-center p-3 font-medium text-gray-900 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('crimeIndex')}
                  title="Crime Index: 1-3 Low (Safe), 4-6 Moderate, 7-10 High (Caution)"
                >
                  Crime Index {getSortIcon('crimeIndex')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedProperties.map((property) => {
                const metrics = analyzeWithCurrentValues(property);
                const isOwned = property.purchased;
                const initialInvestment = Number(property.initial_investment) || 
                  (Number(property.purchase_price) * (Number(property.down_payment_pct) || 20) / 100);

                return (
                  <tr 
                    key={property.id} 
                    className={`hover:bg-gray-50 ${isOwned ? 'bg-green-50' : ''}`}
                  >
                    <td className="p-3">
                      <div className="font-medium text-gray-900">{property.address}</div>
                      <div className="text-xs text-gray-500">
                        {property.abbreviation && `(${property.abbreviation}) `}
                        {property.city}, {property.state}
                      </div>
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatCurrency(property.purchase_price)}
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatCurrency(initialInvestment)}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      metrics.metrics.capRate >= 6 ? 'text-green-600' : 
                      metrics.metrics.capRate >= 4 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(metrics.metrics.capRate)}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      metrics.metrics.cashOnCash >= 8 ? 'text-green-600' : 
                      metrics.metrics.cashOnCash >= 5 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(metrics.metrics.cashOnCash)}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      metrics.metrics.grossYield >= 8 ? 'text-green-600' : 
                      metrics.metrics.grossYield >= 6 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(metrics.metrics.grossYield)}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      metrics.metrics.atROI30y >= 10 ? 'text-green-600' : 
                      metrics.metrics.atROI30y >= 7 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(metrics.metrics.atROI30y)}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      metrics.metrics.tri30y >= 12 ? 'text-green-600' : 
                      metrics.metrics.tri30y >= 8 ? 'text-yellow-600' : 'text-red-600'
                    }`}>
                      {formatPercent(metrics.metrics.tri30y)}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      metrics.metrics.originalAtROI30y >= 10 ? 'text-blue-600' : 
                      metrics.metrics.originalAtROI30y >= 7 ? 'text-blue-500' : 'text-blue-400'
                    }`}>
                      {formatPercent(metrics.metrics.originalAtROI30y)}
                      {metrics.metrics.originalAtROI30y !== metrics.metrics.atROI30y && (
                        <div className="text-xs text-gray-500">
                          Δ{(metrics.metrics.atROI30y - metrics.metrics.originalAtROI30y) >= 0 ? '+' : ''}{(metrics.metrics.atROI30y - metrics.metrics.originalAtROI30y).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      metrics.noiMonthly >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(metrics.noiMonthly)}
                    </td>
                    <td className={`p-3 text-right font-medium ${
                      metrics.cashflowMonthly >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(metrics.cashflowMonthly)}
                    </td>
                    <td className="p-3 text-center">
                      {property.crime_index ? (
                        <div className="inline-flex items-center gap-1">
                          <span className={`text-sm font-medium ${
                            formatCrimeIndex(property.crime_index).color === 'green' ? 'text-green-600' :
                            formatCrimeIndex(property.crime_index).color === 'yellow' ? 'text-yellow-600' : 'text-red-600'
                          }`}>
                            {property.crime_index}
                          </span>
                          <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${
                            formatCrimeIndex(property.crime_index).color === 'green' ? 'bg-green-100 text-green-800' :
                            formatCrimeIndex(property.crime_index).color === 'yellow' ? 'bg-yellow-100 text-yellow-800' : 
                            formatCrimeIndex(property.crime_index).color === 'red' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {formatCrimeIndex(property.crime_index).label}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-500">No data</span>
                      )}
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
              <span>Excellent (Cap ≥6%, CoC ≥8%, Yield ≥8%, 30y ATROI ≥10%, 30y TRI ≥12%)</span>
            </div>
            <div className="flex items-center gap-2 text-gray-900">
              <div className="w-3 h-3 bg-yellow-600 rounded"></div>
              <span>Good (Cap 4-6%, CoC 5-8%, Yield 6-8%, 30y ATROI 7-10%, 30y TRI 8-12%)</span>
            </div>
            <div className="flex items-center gap-2 text-gray-900">
              <div className="w-3 h-3 bg-red-600 rounded"></div>
              <span>Below Target</span>
            </div>
          </div>
        </div>

        {/* Crime Index Legend */}
        <div className="mb-4">
          <h4 className="text-xs font-medium text-gray-700 mb-2">Crime Index (1-10 Scale)</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="flex items-center gap-2 text-gray-900">
              <div className="w-3 h-3 bg-green-600 rounded"></div>
              <span>🟢 Low Crime (1-3) - Safe area</span>
            </div>
            <div className="flex items-center gap-2 text-gray-900">
              <div className="w-3 h-3 bg-yellow-600 rounded"></div>
              <span>🟡 Moderate Crime (4-6) - Average safety</span>
            </div>
            <div className="flex items-center gap-2 text-gray-900">
              <div className="w-3 h-3 bg-red-600 rounded"></div>
              <span>🔴 High Crime (7-10) - Exercise caution</span>
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
          </div>
        </div>
      </div>

      {/* Metrics Definitions */}
      <MetricsDefinitions />
    </main>
  );
}