import React from 'react';

export default function PerformanceChart({ metric, timeRange }) {
  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-600">Performance Chart</h3>
      <div className="h-64 flex items-center justify-center bg-gray-50 rounded">
        <p className="text-gray-500">Chart coming soon - {metric} over {timeRange}</p>
      </div>
    </div>
  );
}