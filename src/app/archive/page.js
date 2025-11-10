'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { analyzeWithCurrentValues } from '@/lib/finance';

export default function ArchivePage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');

  useEffect(() => {
    document.title = 'PI Archive';
  }, []);

  // Also set title immediately for new tabs
  if (typeof window !== 'undefined') {
    document.title = 'PI Archive';
  }

  useEffect(() => {
    loadArchivedProperties();
  }, []);

  async function loadArchivedProperties() {
    try {
      const res = await fetch('/api/properties/archived', { cache: 'no-store' });
      if (res.ok) {
        setProperties(await res.json());
      }
    } catch (error) {
      console.error('Failed to load archived properties:', error);
      setErrMsg('Failed to load archived properties');
    } finally {
      setLoading(false);
    }
  }

  const handleUnarchive = async (propertyId) => {
    if (!confirm('Are you sure you want to unarchive this property? It will be moved back to your main portfolio.')) {
      return;
    }

    try {
      const res = await fetch(`/api/properties/${propertyId}/archive`, { 
        method: 'DELETE' 
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      await loadArchivedProperties(); // Refresh the list
    } catch (error) {
      console.error('Failed to unarchive property:', error);
      setErrMsg('Failed to unarchive property');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading archived properties...</div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <PageHeader 
        title="Archived Properties"
        subtitle={`${properties.length} archived properties. These properties are hidden from charts and analysis but can be restored to your portfolio.`}
        currentPage="/archive"
      />

      {errMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      <div className="space-y-6">
        {properties.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-4">No archived properties found</p>
            <a 
              href="/portfolio" 
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              ← Back to Portfolio
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            {properties.map(property => (
              <ArchivedPropertyCard 
                key={property.id}
                property={property}
                onUnarchive={() => handleUnarchive(property.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function ArchivedPropertyCard({ property, onUnarchive }) {
  const metrics = analyzeWithCurrentValues(property);
  
  // Determine data source for display
  const currentRent = property.current_rent_monthly || property.monthly_rent;
  const usingCurrentValues = !!(property.current_rent_monthly || property.current_appraisal_value || property.current_market_value);
  const dataSource = usingCurrentValues ? "Current Values" : "Purchase Data";

  // Format archive date
  const archivedDate = property.archived_at ? new Date(property.archived_at).toLocaleDateString() : 'Unknown';

  return (
    <div className="rounded-lg border border-gray-300 bg-gray-50 p-4">
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h3 className="font-medium text-gray-900">
              {property.address}
              {property.abbreviation && <span className="ml-2 text-blue-600">({property.abbreviation})</span>}
            </h3>
            <div className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-gray-200 text-gray-800 border border-gray-300">
              📁 ARCHIVED
            </div>
          </div>
          <p className="text-sm text-gray-500 mb-1">
            {property.city}, {property.state} {property.zip}
          </p>
          <p className="text-xs text-gray-500 mb-2">
            Archived: {archivedDate}
          </p>
          {property.purchased && (
            <p className="text-xs text-blue-600 mb-2">
              Purchased: {property.month_purchased ? 
                `${new Date(0, property.month_purchased - 1).toLocaleString('default', { month: 'short' })} ${property.year_purchased}` : 
                property.year_purchased
              }
            </p>
          )}
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-600">Purchase Price:</div>
              <div className="font-medium text-green-600">${Number(property.purchase_price).toLocaleString()}</div>
              {property.current_market_value && (
                <div className="text-xs text-blue-600">
                  Current: ${Number(property.current_market_value).toLocaleString()}
                </div>
              )}
            </div>
            <div>
              <div className="text-gray-600">Monthly Rent:</div>
              <div className="font-medium text-green-600">${Number(currentRent).toLocaleString()}</div>
            </div>
            <div>
              <div className="text-gray-600">Cap Rate:</div>
              <div className="font-medium text-green-600">{metrics.metrics.capRate.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-gray-600">Cash Flow:</div>
              <div className={`font-medium ${metrics.cashflowMonthly >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${metrics.cashflowMonthly.toLocaleString()}/mo
              </div>
              <div className={`font-medium text-xs ${(metrics.cashflowMonthly * 12) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${(metrics.cashflowMonthly * 12).toLocaleString()}/yr
              </div>
            </div>
            <div>
              <div className="text-gray-600">
                DSCR:
                <span className="text-xs text-gray-500 ml-1" title="Debt Service Coverage Ratio: Net Operating Income ÷ Mortgage Payment. Measures ability to cover debt payments. >1.25 is good, >1.0 is acceptable.">ⓘ</span>
              </div>
              <div className={`font-medium ${
                property.mortgage_free ? 'text-gray-500' : 
                metrics.metrics.dscr >= 1.25 ? 'text-green-600' : 
                metrics.metrics.dscr >= 1.0 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {property.mortgage_free ? 'N/A' : metrics.metrics.dscr.toFixed(2)}
              </div>
            </div>
          </div>
          
          {/* Data Source Indicator and Additional Status */}
          <div className="mt-3 pt-2 border-t border-gray-200 flex flex-wrap items-center gap-2">
            <div className={`inline-block px-2 py-1 text-xs rounded ${
              usingCurrentValues 
                ? 'bg-green-100 text-green-700' 
                : 'bg-yellow-100 text-yellow-700'
            }`}>
              Metrics from: {dataSource}
            </div>
            {!property.purchased && (
              <div className="inline-block bg-orange-100 text-orange-800 text-xs px-2 py-1 rounded">
                Investment Analysis
              </div>
            )}
            {property.mortgage_free && (
              <div className="inline-block bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                Owned Outright
              </div>
            )}
          </div>
        </div>
        
        <div className="flex space-x-2 ml-4">
          <button 
            onClick={onUnarchive}
            className="px-3 py-1 text-sm rounded border border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            Unarchive
          </button>
        </div>
      </div>
    </div>
  );
}