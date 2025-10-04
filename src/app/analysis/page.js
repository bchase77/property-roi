'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import PerformanceChart from '@/components/charts/PerformanceChart';
import ComparisonChart from '@/components/charts/ComparisonChart';
import MetricsGrid from '@/components/ui/MetricsGrid';
import PropertySelector from '@/components/ui/PropertySelector';

function AnalysisContent() {
  const searchParams = useSearchParams();
  const [properties, setProperties] = useState([]);
  const [selectedProperties, setSelectedProperties] = useState([]);
  const [timeRange, setTimeRange] = useState('5y'); // 2y, 5y, 10y
  const [primaryMetric, setPrimaryMetric] = useState('totalReturn');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    const propertyId = searchParams.get('property');
    if (propertyId && properties.length > 0) {
      const property = properties.find(p => p.id === parseInt(propertyId));
      if (property) {
        setSelectedProperties([property]);
      }
    }
  }, [searchParams, properties]);

  async function loadProperties() {
    try {
      const res = await fetch('/api/properties', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setProperties(data);
        // Default to first 3 properties for initial view
        setSelectedProperties(data.slice(0, 3));
      }
    } catch (error) {
      console.error('Failed to load properties:', error);
    } finally {
      setLoading(false);
    }
  }

  const togglePropertySelection = (property) => {
    setSelectedProperties(prev => {
      const isSelected = prev.some(p => p.id === property.id);
      if (isSelected) {
        return prev.filter(p => p.id !== property.id);
      } else {
        return [...prev, property];
      }
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading analysis...</div>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl p-6 space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold mb-2">Investment Analysis</h1>
          <p className="text-gray-600">Performance charts, projections, and market comparisons</p>
        </div>
        
        {/* View Controls */}
        <div className="flex space-x-4">
          <select 
            value={timeRange} 
            onChange={(e) => setTimeRange(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="2y">2 Years</option>
            <option value="5y">5 Years</option>
            <option value="10y">10 Years</option>
          </select>
          
          <select 
            value={primaryMetric} 
            onChange={(e) => setPrimaryMetric(e.target.value)}
            className="border rounded-md px-3 py-2"
          >
            <option value="totalReturn">Total Return</option>
            <option value="irr">IRR</option>
            <option value="npv">NPV</option>
            <option value="cagr">CAGR</option>
            <option value="cashFlow">Cash Flow</option>
            <option value="capRate">Cap Rate</option>
          </select>
        </div>
      </header>

      {/* Property Selection */}
      <PropertySelector 
        properties={properties}
        selectedProperties={selectedProperties}
        onToggleProperty={togglePropertySelection}
      />

      {/* Key Metrics Grid */}
      <MetricsGrid 
        properties={selectedProperties}
        timeRange={timeRange}
      />

      {/* Performance Charts */}
      <div className="grid lg:grid-cols-2 gap-8">
        <PerformanceChart 
          properties={selectedProperties}
          metric={primaryMetric}
          timeRange={timeRange}
        />
        
        <ComparisonChart 
          properties={selectedProperties}
          timeRange={timeRange}
          includeMarketData={true}
        />
      </div>

      {/* Detailed Analysis Table */}
      <DetailedAnalysisTable 
        properties={selectedProperties}
        timeRange={timeRange}
      />
    </main>
  );
}

function DetailedAnalysisTable({ properties, timeRange }) {
  // This would contain a comprehensive table with all financial metrics
  // IRR, NPV, CAGR, Sharpe ratio, etc.
  return (
    <section className="bg-white rounded-lg border p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-600">Detailed Financial Analysis</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2 text-gray-900 font-semibold">Property</th>
              <th className="text-right p-2 text-gray-900 font-semibold">IRR</th>
              <th className="text-right p-2 text-gray-900 font-semibold">NPV</th>
              <th className="text-right p-2 text-gray-900 font-semibold">CAGR</th>
              <th className="text-right p-2 text-gray-900 font-semibold">Cash-on-Cash</th>
              <th className="text-right p-2 text-gray-900 font-semibold">Cap Rate</th>
              <th className="text-right p-2 text-gray-900 font-semibold">DSCR</th>
            </tr>
          </thead>
          <tbody>
            {properties.map(property => (
              <tr key={property.id} className="border-b">
                <td className="p-2 font-medium text-gray-900">{property.address}</td>
                <td className="p-2 text-right text-gray-800">12.5%</td>
                <td className="p-2 text-right text-gray-800">$45,230</td>
                <td className="p-2 text-right text-gray-800">8.7%</td>
                <td className="p-2 text-right text-gray-800">11.2%</td>
                <td className="p-2 text-right text-gray-800">6.8%</td>
                <td className="p-2 text-right text-gray-800">1.45</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Analysis() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AnalysisContent />
    </Suspense>
  );
}