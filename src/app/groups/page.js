'use client';
import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { analyzeWithCurrentValues, calculateCAGR, calculateEquityAtYear } from '@/lib/finance';
import { calculateMarketInvestmentValue } from '@/lib/marketData';

export default function GroupAnalysis() {
  const [properties, setProperties] = useState([]);
  const [customGroups, setCustomGroups] = useState([]);
  const [selectedProperties, setSelectedProperties] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState(null);

  useEffect(() => {
    document.title = 'GR - Groups';
  }, []);

  useEffect(() => {
    loadProperties();
    loadCustomGroups();
  }, []);

  async function loadProperties() {
    try {
      const { default: apiClient } = await import('@/lib/apiClient');
      const data = await apiClient.getProperties();
      setProperties(data);
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadCustomGroups() {
    try {
      const savedGroups = localStorage.getItem('propertyCustomGroups');
      if (savedGroups) {
        setCustomGroups(JSON.parse(savedGroups));
      }
    } catch (error) {
      console.error('Failed to load custom groups:', error);
      setCustomGroups([]);
    }
  }

  const saveCustomGroups = (groups) => {
    try {
      localStorage.setItem('propertyCustomGroups', JSON.stringify(groups));
      setCustomGroups(groups);
    } catch (error) {
      console.error('Failed to save custom groups:', error);
    }
  };

  const createCustomGroup = () => {
    if (newGroupName.trim() && selectedPropertiesList.length > 0) {
      const newGroup = {
        id: Date.now().toString(),
        name: newGroupName.trim(),
        propertyIds: Array.from(selectedProperties),
        createdAt: new Date().toISOString()
      };
      
      const updatedGroups = [...customGroups, newGroup];
      saveCustomGroups(updatedGroups);
      
      setNewGroupName('');
      setShowCreateGroupModal(false);
    }
  };

  const deleteCustomGroup = (groupId) => {
    const updatedGroups = customGroups.filter(group => group.id !== groupId);
    saveCustomGroups(updatedGroups);
  };

  const removePropertyFromGroup = (groupId, propertyId) => {
    const updatedGroups = customGroups.map(group => {
      if (group.id === groupId) {
        return {
          ...group,
          propertyIds: group.propertyIds.filter(id => id !== propertyId)
        };
      }
      return group;
    });
    saveCustomGroups(updatedGroups);
  };

  const addPropertyToGroup = (groupId, propertyId) => {
    const updatedGroups = customGroups.map(group => {
      if (group.id === groupId && !group.propertyIds.includes(propertyId)) {
        return {
          ...group,
          propertyIds: [...group.propertyIds, propertyId]
        };
      }
      return group;
    });
    saveCustomGroups(updatedGroups);
  };

  const selectCustomGroup = (customGroup) => {
    const groupProperties = properties.filter(p => customGroup.propertyIds.includes(p.id));
    setSelectedProperties(new Set(groupProperties.map(p => p.id)));
  };

  // Create automatic state-based groups
  const stateGroups = properties.reduce((groups, property) => {
    const state = property.state || 'Unknown';
    if (!groups[state]) {
      groups[state] = [];
    }
    groups[state].push(property);
    return groups;
  }, {});

  // Create predefined groups
  const predefinedGroups = {
    'All Properties': properties,
    'Owned Properties': properties.filter(p => p.purchased),
    'Projected Properties': properties.filter(p => !p.purchased),
    'Mortgage-Free': properties.filter(p => p.mortgage_free),
    'With Mortgage': properties.filter(p => p.purchased && !p.mortgage_free),
    ...Object.fromEntries(
      Object.entries(stateGroups).map(([state, props]) => [`${state} Properties`, props])
    )
  };

  // Calculate group metrics
  const calculateGroupMetrics = (groupProperties) => {
    if (groupProperties.length === 0) return null;

    let totalCashFlow = 0;
    let totalInvestment = 0;
    let totalCurrentValue = 0;
    let totalEquity = 0;
    let totalNOI = 0;
    let totalPurchasePrice = 0;
    let weightedCapRate = 0;
    let weightedCashOnCash = 0;
    let weightedGrossYield = 0;
    let weightedATROI30y = 0;
    let weightedTRI30y = 0;
    let weightedOriginalATROI30y = 0;
    const currentYear = 2025;

    groupProperties.forEach(property => {
      const metrics = analyzeWithCurrentValues(property);
      const purchasePrice = Number(property.purchase_price) || 0;
      
      totalCashFlow += metrics.cashflowMonthly;
      totalNOI += metrics.noiMonthly;
      totalPurchasePrice += purchasePrice;
      
      const investment = Number(property.initial_investment) || 
        (purchasePrice * ((Number(property.down_payment_pct) || 20) / 100));
      totalInvestment += investment;

      const currentMarketValue = Number(property.current_market_value) || purchasePrice || 0;
      totalCurrentValue += currentMarketValue;

      const equity = calculateEquityAtYear(property, currentYear, currentMarketValue);
      totalEquity += equity;

      // Weight metrics by purchase price for better averaging
      if (purchasePrice > 0) {
        weightedCapRate += metrics.metrics.capRate * purchasePrice;
        weightedCashOnCash += metrics.metrics.cashOnCash * purchasePrice;
        weightedGrossYield += metrics.metrics.grossYield * purchasePrice;
        weightedATROI30y += metrics.metrics.atROI30y * purchasePrice;
        weightedTRI30y += metrics.metrics.tri30y * purchasePrice;
        weightedOriginalATROI30y += metrics.metrics.originalAtROI30y * purchasePrice;
      }
    });

    // Calculate weighted averages
    const avgCapRate = totalPurchasePrice > 0 ? weightedCapRate / totalPurchasePrice : 0;
    const avgCashOnCash = totalPurchasePrice > 0 ? weightedCashOnCash / totalPurchasePrice : 0;
    const avgGrossYield = totalPurchasePrice > 0 ? weightedGrossYield / totalPurchasePrice : 0;
    const avgATROI30y = totalPurchasePrice > 0 ? weightedATROI30y / totalPurchasePrice : 0;
    const avgTRI30y = totalPurchasePrice > 0 ? weightedTRI30y / totalPurchasePrice : 0;
    const avgOriginalATROI30y = totalPurchasePrice > 0 ? weightedOriginalATROI30y / totalPurchasePrice : 0;

    const avgPurchaseYear = groupProperties
      .filter(p => p.year_purchased)
      .reduce((sum, p) => sum + p.year_purchased, 0) / 
      groupProperties.filter(p => p.year_purchased).length;

    let groupCAGR = 0;
    let marketComparison = null;

    if (totalInvestment > 0 && avgPurchaseYear && !isNaN(avgPurchaseYear)) {
      const years = currentYear - avgPurchaseYear;
      if (years > 0) {
        groupCAGR = calculateCAGR(totalInvestment, totalEquity, years);
        
        // Calculate what the same investment would be worth in S&P 500
        marketComparison = calculateMarketInvestmentValue(
          totalInvestment, 
          Math.round(avgPurchaseYear), 
          1, 
          currentYear, 
          10
        );
      }
    }

    return {
      totalProperties: groupProperties.length,
      ownedProperties: groupProperties.filter(p => p.purchased).length,
      projectedProperties: groupProperties.filter(p => !p.purchased).length,
      totalCashFlow,
      totalInvestment,
      totalCurrentValue,
      totalEquity,
      totalNOI,
      totalPurchasePrice,
      avgCapRate,
      avgCashOnCash,
      avgGrossYield,
      avgATROI30y,
      avgTRI30y,
      avgOriginalATROI30y,
      groupCAGR,
      marketComparison,
      avgPurchaseYear: avgPurchaseYear || null
    };
  };

  const togglePropertySelection = (propertyId) => {
    const newSelected = new Set(selectedProperties);
    if (newSelected.has(propertyId)) {
      newSelected.delete(propertyId);
    } else {
      newSelected.add(propertyId);
    }
    setSelectedProperties(newSelected);
  };

  const selectGroup = (groupProperties) => {
    setSelectedProperties(new Set(groupProperties.map(p => p.id)));
  };

  const clearSelection = () => {
    setSelectedProperties(new Set());
  };

  const selectedPropertiesList = properties.filter(p => selectedProperties.has(p.id));
  const selectedMetrics = calculateGroupMetrics(selectedPropertiesList);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading properties...</div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <PageHeader 
        title="Property Group Analysis"
        subtitle="Group properties and compare performance against market benchmarks"
        currentPage="/groups"
      />

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left Panel - Property Selection */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-600">Property Selection</h2>
              <div className="flex gap-2">
                {selectedPropertiesList.length > 0 && (
                  <button 
                    onClick={() => setShowCreateGroupModal(true)}
                    className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                  >
                    Create Group
                  </button>
                )}
                <button 
                  onClick={clearSelection}
                  className="text-sm text-red-600 hover:text-red-800"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Individual Properties */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Individual Properties</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {properties.map(property => (
                    <label key={property.id} className="flex items-center space-x-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selectedProperties.has(property.id)}
                        onChange={() => togglePropertySelection(property.id)}
                        className="rounded border-gray-300"
                      />
                      <span className={property.purchased ? 'text-green-700' : 'text-orange-600'}>
                        {property.address} {property.abbreviation && `(${property.abbreviation})`}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Predefined Groups */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-2">Quick Select Groups</h3>
                <div className="space-y-1">
                  {Object.entries(predefinedGroups).map(([groupName, groupProperties]) => (
                    <button
                      key={groupName}
                      onClick={() => selectGroup(groupProperties)}
                      className="w-full text-left px-3 py-2 text-gray-600 text-sm rounded border border-gray-200 hover:bg-gray-50 flex justify-between"
                    >
                      <span>{groupName}</span>
                      <span className="text-gray-500">({groupProperties.length})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Groups */}
              {customGroups.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Custom Groups</h3>
                  <div className="space-y-1">
                    {customGroups.map(customGroup => {
                      const groupProperties = properties.filter(p => customGroup.propertyIds.includes(p.id));
                      return (
                        <div key={customGroup.id} className="group relative">
                          <button
                            onClick={() => selectCustomGroup(customGroup)}
                            className="w-full text-left px-3 py-2 text-sm rounded border border-blue-200 bg-blue-50 hover:bg-blue-100 flex justify-between"
                          >
                            <span className="text-blue-800 font-medium">{customGroup.name}</span>
                            <span className="text-blue-600">({groupProperties.length})</span>
                          </button>
                          <div className="absolute right-1 top-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingGroupId(customGroup.id);
                              }}
                              className="text-xs bg-white border border-gray-300 px-1 py-0.5 rounded text-gray-600 hover:text-gray-800"
                              title="Edit group"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete group "${customGroup.name}"?`)) {
                                  deleteCustomGroup(customGroup.id);
                                }
                              }}
                              className="text-xs bg-white border border-gray-300 px-1 py-0.5 rounded text-red-600 hover:text-red-800"
                              title="Delete group"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Analysis Results */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg  text-gray-500 font-semibold mb-4">
              Group Analysis 
              {selectedPropertiesList.length > 0 && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  ({selectedPropertiesList.length} properties selected)
                </span>
              )}
            </h2>

            {selectedPropertiesList.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p>Select properties or a group to see analysis</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Key Metrics Grid */}
                <div className="grid md:grid-cols-5 gap-3">
                  <MetricCard 
                    title="Cap Rate" 
                    value={`${selectedMetrics.avgCapRate.toFixed(2)}%`}
                    subtitle="Average cap rate"
                  />
                  <MetricCard 
                    title="Cash on Cash" 
                    value={`${selectedMetrics.avgCashOnCash.toFixed(2)}%`}
                    subtitle="Average CoC return"
                  />
                  <MetricCard 
                    title="Gross Yield" 
                    value={`${selectedMetrics.avgGrossYield.toFixed(2)}%`}
                    subtitle="Average yield"
                  />
                  <MetricCard 
                    title="30Y ATROI" 
                    value={`${selectedMetrics.avgATROI30y.toFixed(2)}%`}
                    subtitle="Average 30yr ATROI"
                  />
                  <MetricCard 
                    title="30Y TRI" 
                    value={`${selectedMetrics.avgTRI30y.toFixed(2)}%`}
                    subtitle="Average 30yr TRI"
                  />
                </div>

                {/* Second Metrics Row */}
                <div className="grid md:grid-cols-5 gap-3">
                  <MetricCard 
                    title="Orig 30Y ATROI" 
                    value={`${selectedMetrics.avgOriginalATROI30y.toFixed(2)}%`}
                    subtitle="Original 30yr ATROI"
                  />
                  <MetricCard 
                    title="NOI/Month" 
                    value={`$${selectedMetrics.totalNOI.toLocaleString()}`}
                    subtitle="Net operating income"
                  />
                  <MetricCard 
                    title="Cash Flow/Month" 
                    value={`$${selectedMetrics.totalCashFlow.toLocaleString()}`}
                    subtitle="Net monthly income"
                  />
                  <MetricCard 
                    title="Total Investment" 
                    value={`$${selectedMetrics.totalInvestment.toLocaleString()}`}
                    subtitle="Initial cash invested"
                  />
                  <MetricCard 
                    title="Total Starting Value" 
                    value={`$${selectedMetrics.totalPurchasePrice.toLocaleString()}`}
                    subtitle="Total purchase prices"
                  />
                </div>

                {/* Properties Summary */}
                <div className="grid md:grid-cols-3 gap-3">
                  <MetricCard 
                    title="Properties" 
                    value={`${selectedMetrics.ownedProperties} / ${selectedMetrics.totalProperties}`}
                    subtitle="Owned / Total"
                  />
                  <MetricCard 
                    title="Current Market Value" 
                    value={`$${selectedMetrics.totalCurrentValue.toLocaleString()}`}
                    subtitle="Total current value"
                  />
                  <MetricCard 
                    title="Current Equity" 
                    value={`$${selectedMetrics.totalEquity.toLocaleString()}`}
                    subtitle="Current value - debt"
                  />
                </div>

                {/* Performance Comparison */}
                {selectedMetrics.marketComparison && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">Market Comparison</h3>
                    <div className="grid md:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Group CAGR</div>
                        <div className={`font-medium ${
                          selectedMetrics.groupCAGR > selectedMetrics.marketComparison.annualizedReturn 
                            ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {selectedMetrics.groupCAGR.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-600">S&P 500 CAGR</div>
                        <div className="font-medium text-blue-600">
                          {selectedMetrics.marketComparison.annualizedReturn.toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-600">Outperformance</div>
                        <div className={`font-medium ${
                          selectedMetrics.groupCAGR > selectedMetrics.marketComparison.annualizedReturn 
                            ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {(selectedMetrics.groupCAGR - selectedMetrics.marketComparison.annualizedReturn).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Selected Properties List */}
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Selected Properties</h3>
                  <div className="space-y-2">
                    {selectedPropertiesList.map(property => {
                      const metrics = analyzeWithCurrentValues(property);
                      return (
                        <div key={property.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                          <div>
                            <div className="font-medium">
                              {property.address} {property.abbreviation && `(${property.abbreviation})`}
                            </div>
                            <div className="text-sm text-gray-600">
                              {property.purchased ? 'Owned' : 'Projected'} • 
                              {property.city}, {property.state}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-medium">
                              ${metrics.cashflowMonthly.toLocaleString()}/mo
                            </div>
                            <div className="text-sm text-gray-600">
                              Cap Rate: {metrics.metrics.capRate.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Group Modal */}
      {showCreateGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-90vw">
            <h2 className="text-lg font-semibold mb-4">Create New Group</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Group Name
              </label>
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2"
                placeholder="Enter group name..."
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    createCustomGroup();
                  }
                }}
                autoFocus
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Selected Properties ({selectedPropertiesList.length})
              </label>
              <div className="max-h-32 overflow-y-auto bg-gray-50 rounded p-2">
                {selectedPropertiesList.map(property => (
                  <div key={property.id} className="text-sm text-gray-700">
                    • {property.address} {property.abbreviation && `(${property.abbreviation})`}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowCreateGroupModal(false);
                  setNewGroupName('');
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={createCustomGroup}
                disabled={!newGroupName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300"
              >
                Create Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {editingGroupId && (
        <EditGroupModal
          group={customGroups.find(g => g.id === editingGroupId)}
          properties={properties}
          onSave={(updatedGroup) => {
            const updatedGroups = customGroups.map(g => 
              g.id === editingGroupId ? updatedGroup : g
            );
            saveCustomGroups(updatedGroups);
            setEditingGroupId(null);
          }}
          onCancel={() => setEditingGroupId(null)}
        />
      )}
    </main>
  );
}

function MetricCard({ title, value, subtitle }) {
  return (
    <div className="bg-white rounded-lg border p-4 text-center">
      <h3 className="text-sm font-medium text-gray-700 mb-1">{title}</h3>
      <div className="text-xl font-bold text-gray-900">{value}</div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}