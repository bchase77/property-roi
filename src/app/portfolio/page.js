'use client';
import { useEffect, useState } from 'react';
import PropertyEditor from '@/components/forms/PropertyEditor';
import YearlyDataEditor from '@/components/forms/YearlyDataEditor';
import CurrentValuesEditor from '@/components/forms/CurrentValuesEditor';
import PropertyList from '@/components/ui/PropertyList';
import { analyzeWithCurrentValues } from '@/lib/finance';

export default function Portfolio() {
  const [properties, setProperties] = useState([]);
  const [editingProperty, setEditingProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errMsg, setErrMsg] = useState('');

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
      setErrMsg('Failed to load properties');
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

  const handlePropertyUpdate = async (updatedProperty) => {
    try {
      await loadProperties(); // Refresh the list
      setEditingProperty(null);
    } catch (error) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading portfolio...</div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <header>
        <h1 className="text-3xl font-bold mb-2">Property Portfolio</h1>
        <p className="text-gray-600">Manage your existing properties and update historical data. </p>
        Select a property from the list to edit its details and add yearly financial data
      </header>

      {errMsg && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errMsg}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Property List */}
        <div className="space-y-6">
          <h2 className="text-xl font-semibold">Your Properties</h2>
          
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
              properties={properties}
              onEdit={startEdit}
              onDelete={handlePropertyDelete}
              editingId={editingProperty?.id}
            />
          )}
        </div>

        {/* Property Editor */}
        <div className="space-y-6">
          {editingProperty ? (
            <>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold">Edit Property</h2>
                <button 
                  onClick={cancelEdit}
                  className="text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
              
              <PropertyEditor 
                property={editingProperty}
                onUpdate={handlePropertyUpdate}
                onCancel={cancelEdit}
              />
              
              {/* Only show current values editor for owned properties */}
              {editingProperty.purchased && (
                <CurrentValuesEditor 
                  property={editingProperty}
                  onUpdate={handlePropertyUpdate}
                  onCancel={cancelEdit}
                />
              )}
              
              <YearlyDataEditor 
                property={editingProperty}
                onUpdate={loadProperties}
              />
            </>
          ) : (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">
                Select a property from the list to edit its details and add yearly financial data
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Portfolio Summary */}
      {properties.length > 0 && (
        <PortfolioSummary properties={properties} />
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