'use client';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import AssetValueChart from '@/components/charts/AssetValueChart';

export default function AssetValuePopoutPage() {
  const [properties, setProperties] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const searchParams = useSearchParams();

  useEffect(() => {
    document.title = 'Asset Value Chart - Property ROI Calculator';
  }, []);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      // Load properties
      const propertiesRes = await fetch('/api/properties', { cache: 'no-store' });
      if (propertiesRes.ok) {
        const propertiesData = await propertiesRes.json();
        setProperties(propertiesData);
      }

      // Load scenarios
      const scenariosRes = await fetch('/api/scenarios', { cache: 'no-store' });
      if (scenariosRes.ok) {
        const scenariosData = await scenariosRes.json();
        setScenarios(scenariosData);
      }
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg text-gray-600 mb-2">Loading chart data...</div>
          <div className="text-sm text-gray-500">Please wait</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Asset Value Chart (Pop-out View)</h1>
        <div className="text-sm text-gray-600">
          Full-size interactive chart with all controls • {properties.length} properties loaded
        </div>
      </div>
      
      <div style={{ height: 'calc(100vh - 140px)' }} className="flex flex-col">
        <AssetValueChart 
          properties={properties} 
          scenarios={scenarios}
          onRefreshData={loadData}
          isPopout={true}
        />
      </div>
    </div>
  );
}