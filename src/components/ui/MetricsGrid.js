import React from 'react';

export default function MetricsGrid({ properties, timeRange }) {
  return (
    <div className="grid md:grid-cols-4 gap-6">
      <MetricCard title="Avg IRR" value="12.5%" />
      <MetricCard title="Total NPV" value="$125,000" />
      <MetricCard title="Portfolio CAGR" value="8.7%" />
      <MetricCard title="Cash Flow" value="$4,200/mo" />
    </div>
  );
}

function MetricCard({ title, value }) {
  return (
    <div className="bg-white rounded-lg border p-4 text-center">
      <h3 className="text-sm font-medium text-gray-700 mb-1">{title}</h3>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
    </div>
  );
}