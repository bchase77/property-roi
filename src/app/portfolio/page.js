'use client';
import { useEffect, useState } from 'react';
import PropertyEditor from '@/components/forms/PropertyEditor';
import YearlyDataEditor from '@/components/forms/YearlyDataEditor';
import PropertyList from '@/components/ui/PropertyList';
import PageHeader from '@/components/ui/PageHeader';
import MetricsDefinitions from '@/components/ui/MetricsDefinitions';
import { analyzeWithCurrentValues } from '@/lib/finance';
import { mergePropertiesAndScenarios } from '@/lib/scenarioHelpers';

export default function Portfolio() {
  const [properties, setProperties] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [editingProperty, setEditingProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');
  const [loadingMessage, setLoadingMessage] = useState('Loading properties...');

  useEffect(() => {
    document.title = 'PF - Portfolio';
  }, []);

  // Also set title immediately for new tabs
  if (typeof window !== 'undefined') {
    document.title = 'PF - Portfolio';
  }

  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties() {
    try {
      setLoadingMessage('Checking local cache...');
      const { default: apiClient } = await import('@/lib/apiClient');
      
      // Add timeout for slow connections
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Loading timeout')), 20000)
      );
      
      setLoadingMessage('Loading properties...');
      const properties = await Promise.race([
        apiClient.getProperties(),
        timeoutPromise
      ]);
      
      console.log(`Loaded ${properties.length} properties`);
      setProperties(properties);
      
      // Load scenarios for all properties
      if (properties.length > 0) {
        setLoadingMessage('Loading scenarios...');
        try {
          const scenarioPromises = properties.map(async (property) => {
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
          console.log(`Loaded ${allScenarios.length} scenarios`);
          setScenarios(allScenarios);
        } catch (error) {
          console.error('Failed to load scenarios:', error);
        }
      }
      
      if (properties.length === 0) {
        setLoadingMessage('No properties found. Add some properties to get started!');
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
      if (error.message === 'Loading timeout') {
        setErrMsg('Loading taking too long due to slow connection. Using offline mode.');
        setLoadingMessage('Connection timeout - check if you have any offline properties');
      } else {
        setErrMsg('Failed to load properties. Check your connection.');
        setLoadingMessage('Failed to load properties');
      }
    } finally {
      setLoading(false);
    }
  }

  const startEdit = (property) => {
    setEditingProperty(property);
    setErrMsg('');
  };

  const cancelEdit = () => {
    setEditingProperty(null);
    setErrMsg('');
  };

  const handlePropertyUpdate = async () => {
    try {
      await loadProperties(); // Refresh the list
      setEditingProperty(null);
    } catch {
      setErrMsg('Failed to update property');
    }
  };

  const handlePropertyDelete = async (propertyId) => {
    if (!confirm('Are you sure you want to delete this property? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch(`/api/properties/${propertyId}`, { 
        method: 'DELETE' 
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      await loadProperties(); // Refresh the list
      
      // If we were editing this property, close the editor
      if (editingProperty && editingProperty.id === propertyId) {
        setEditingProperty(null);
      }
    } catch (error) {
      console.error('Failed to delete property:', error);
      setErrMsg('Failed to delete property');
    }
  };

  const handlePropertyArchive = async (propertyId) => {
    if (!confirm('Are you sure you want to archive this property? You can unarchive it later from the Archive page.')) {
      return;
    }

    try {
      const res = await fetch(`/api/properties/${propertyId}/archive`, { 
        method: 'POST' 
      });
      
      if (!res.ok) {
        throw new Error(await res.text());
      }
      
      await loadProperties(); // Refresh the list
      
      // If we were editing this property, close the editor
      if (editingProperty && editingProperty.id === propertyId) {
        setEditingProperty(null);
      }
    } catch (error) {
      console.error('Failed to archive property:', error);
      setErrMsg('Failed to archive property');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">{loadingMessage}</div>
      </div>
    );
  }

  // If editing a property, show full-width editor
  if (editingProperty) {
    return (
      <>
        {/* Property Editor - Full Width */}
        <PropertyEditor 
          property={editingProperty}
          onUpdate={handlePropertyUpdate}
          onCancel={cancelEdit}
        />
        
        {/* Additional Editors */}
        <div className="mx-auto max-w-7xl p-6 space-y-8">
          <YearlyDataEditor 
            property={editingProperty}
            onUpdate={loadProperties}
          />
        </div>
      </>
    );
  }

  // Calculate property counts
  const ownedCount = properties.filter(p => p.purchased).length;
  const projectedCount = properties.filter(p => !p.purchased).length;
  const portfolioSubtitle = `${ownedCount} owned properties, ${projectedCount} projected investments. Select a property to edit its details and add yearly financial data`;

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <PageHeader 
        title="Property Portfolio"
        subtitle={portfolioSubtitle}
        currentPage="/portfolio"
      />

      {errMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Your Properties</h2>
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-100 border border-green-200 rounded-full"></div>
              <span className="text-gray-600">{ownedCount} Owned</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-100 border border-orange-200 rounded-full"></div>
              <span className="text-gray-600">{projectedCount} Projected</span>
            </div>
          </div>
        </div>
        
        {properties.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500 mb-4">No properties found</p>
            <a 
              href="/data-entry" 
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              Add your first property →
            </a>
          </div>
        ) : (
          <PropertyList 
            properties={mergePropertiesAndScenarios(properties, scenarios)}
            onEdit={startEdit}
            onDelete={handlePropertyDelete}
            onArchive={handlePropertyArchive}
            editingId={editingProperty?.id}
          />
        )}
      </div>

      {/* Portfolio Summary */}
      {properties.length > 0 && (
        <PortfolioSummary properties={properties} />
      )}

      {/* Metrics Definitions */}
      {properties.length > 0 && (
        <MetricsDefinitions />
      )}
    </main>
  );
}

function PortfolioSummary({ properties }) {
  // Only include purchased properties in portfolio summary
  const purchasedProperties = properties.filter(p => p.purchased);
  
  const totalValue = purchasedProperties.reduce((sum, p) => sum + Number(p.current_market_value || p.purchase_price), 0);
  const totalRent = purchasedProperties.reduce((sum, p) => sum + Number(p.current_rent_monthly || p.monthly_rent), 0);
  const ownedOutright = purchasedProperties.filter(p => p.mortgage_free).length;
  const financed = purchasedProperties.length - ownedOutright;
  
  // Calculate total annual net cash flow
  const totalNetCashFlow = purchasedProperties.reduce((sum, p) => {
    const metrics = analyzeWithCurrentValues(p);
    return sum + (metrics.cashflowMonthly * 12);
  }, 0);

  return (
    <section className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Portfolio Summary</h2>
      
      <div className="grid md:grid-cols-4 gap-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            ${totalValue.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Total Value</div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            ${totalRent.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Monthly Rent</div>
        </div>
        
        <div className="text-center">
          <div className={`text-2xl font-bold ${totalNetCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            ${totalNetCashFlow.toLocaleString()}
          </div>
          <div className="text-sm text-gray-500">Annual Net Cash Flow</div>
        </div>
        
        <div className="text-center">
          <div className="text-2xl font-bold text-gray-900">
            {ownedOutright} / {financed}
          </div>
          <div className="text-sm text-gray-500">Owned / Financed</div>
        </div>
      </div>
    </section>
  );
}