'use client';
import React, { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';

export default function BulkLookup() {
  const [addresses, setAddresses] = useState(['', '', '', '', '']);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Set page title
  useEffect(() => {
    document.title = 'BL - Bulk Lookup';
  }, []);

  // Also set title immediately for new tabs
  if (typeof window !== 'undefined') {
    document.title = 'BL - Bulk Lookup';
  }

  const handleAddressChange = (index, value) => {
    const newAddresses = [...addresses];
    newAddresses[index] = value;
    setAddresses(newAddresses);
  };

  const addMoreFields = () => {
    setAddresses([...addresses, '']);
  };

  const removeField = (index) => {
    if (addresses.length > 1) {
      const newAddresses = addresses.filter((_, i) => i !== index);
      setAddresses(newAddresses);
    }
  };

  const lookupProperties = async () => {
    const validAddresses = addresses.filter(addr => addr.trim().length > 0);
    
    if (validAddresses.length === 0) {
      setError('Please enter at least one address');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const lookupResults = [];
      
      for (const address of validAddresses) {
        try {
          // Call Zillow API for each address
          const response = await fetch('/api/zillow/bulk-lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: address.trim() })
          });

          const data = await response.json();
          
          lookupResults.push({
            address: address.trim(),
            success: response.ok,
            data: data.success ? data : null,
            error: !response.ok ? data.error : null
          });
          
          // Add delay between requests to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (err) {
          lookupResults.push({
            address: address.trim(),
            success: false,
            data: null,
            error: err.message
          });
        }
      }
      
      setResults(lookupResults);
      
    } catch (err) {
      setError('Failed to lookup properties: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const openApiResponseWindow = (address, apiResponses) => {
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>API Debug: ${address}</title>
          <style>
            body { font-family: monospace; margin: 20px; background: #f5f5f5; }
            .step { background: white; margin: 20px 0; padding: 15px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
            .step-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 10px; }
            .api-call { background: #f8f9fa; border-left: 4px solid #007bff; padding: 10px; margin: 10px 0; }
            .api-name { font-weight: bold; color: #007bff; }
            .url { color: #666; word-break: break-all; margin: 5px 0; }
            .status-ok { color: green; }
            .status-error { color: red; }
            .response-data { background: #f1f3f4; padding: 10px; border-radius: 4px; margin-top: 8px; max-height: 300px; overflow-y: auto; }
            pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; font-size: 12px; }
          </style>
        </head>
        <body>
          <h1>🏠 API Debug for: ${address}</h1>
          
          <div class="step">
            <div class="step-title">🎯 Step 1: Exact Property Match</div>
            ${apiResponses.step1_exact_match.map(resp => `
              <div class="api-call">
                <div class="api-name">${resp.api}</div>
                <div class="url">${resp.url}</div>
                <div class="${resp.status === 'ERROR' ? 'status-error' : resp.status === 200 ? 'status-ok' : 'status-error'}">
                  Status: ${resp.status} ${resp.error ? '- ' + resp.error : ''}
                </div>
                <div class="response-data">
                  <pre>${JSON.stringify(resp.data, null, 2)}</pre>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div class="step">
            <div class="step-title">🏠 Step 2: Property Details</div>
            ${apiResponses.step2_property_details.map(resp => `
              <div class="api-call">
                <div class="api-name">${resp.api || 'Unknown API'}</div>
                <div class="url">${resp.url || 'N/A'}</div>
                <div class="${resp.status === 'ERROR' ? 'status-error' : resp.status === 200 ? 'status-ok' : 'status-error'}">
                  Status: ${resp.status} ${resp.error ? '- ' + resp.error : ''}
                </div>
                <div class="response-data">
                  <pre>${JSON.stringify(resp.data, null, 2)}</pre>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div class="step">
            <div class="step-title">📍 Step 3: Nearby Comparables</div>
            ${apiResponses.step3_nearby_comparables.map(resp => `
              <div class="api-call">
                <div class="api-name">${resp.api || 'Unknown API'}</div>
                <div class="url">${resp.url || 'N/A'}</div>
                <div class="${resp.status === 'ERROR' ? 'status-error' : resp.status === 200 ? 'status-ok' : 'status-error'}">
                  Status: ${resp.status} ${resp.error ? '- ' + resp.error : ''}
                </div>
                <div class="response-data">
                  <pre>${JSON.stringify(resp.data, null, 2)}</pre>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div class="step">
            <div class="step-title">🔍 Step 4: Wider Area Comparables</div>
            ${apiResponses.step4_wider_comparables.map(resp => `
              <div class="api-call">
                <div class="api-name">${resp.api || 'Unknown API'}</div>
                <div class="url">${resp.url || 'N/A'}</div>
                <div class="${resp.status === 'ERROR' ? 'status-error' : resp.status === 200 ? 'status-ok' : 'status-error'}">
                  Status: ${resp.status} ${resp.error ? '- ' + resp.error : ''}
                </div>
                <div class="response-data">
                  <pre>${JSON.stringify(resp.data, null, 2)}</pre>
                </div>
              </div>
            `).join('')}
          </div>
        </body>
      </html>
    `;

    const newWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');
    newWindow.document.write(htmlContent);
    newWindow.document.close();
  };

  const exportResults = () => {
    const successfulResults = results.filter(r => r.success && r.data);
    if (successfulResults.length === 0) {
      alert('No successful results to export');
      return;
    }

    const csvContent = [
      'Address,ZPID,Estimated Rent,Property Type,Bedrooms,Bathrooms,Square Feet,Lot Size,Year Built,Source',
      ...successfulResults.map(result => {
        const d = result.data;
        return [
          `"${result.address}"`,
          d.zpid || '',
          d.rentEstimate || '',
          d.propertyType || '',
          d.bedrooms || '',
          d.bathrooms || '',
          d.livingArea || '',
          d.lotAreaValue || '',
          d.yearBuilt || '',
          d.source || 'Zillow'
        ].join(',');
      })
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `property-rent-estimates-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-8">
      <PageHeader 
        title="Bulk Property Rent Lookup"
        subtitle="Enter multiple addresses to get Zillow rent estimates"
        currentPage="/bulk-lookup"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* Address Input Section */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-600 mb-4">Property Addresses</h2>
        
        <div className="space-y-3">
          {addresses.map((address, index) => (
            <div key={index} className="flex gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="e.g. 123 Main St, Dallas, TX 75201"
                  value={address}
                  onChange={(e) => handleAddressChange(index, e.target.value)}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              {addresses.length > 1 && (
                <button
                  onClick={() => removeField(index)}
                  className="px-3 py-2 text-red-600 hover:text-red-800"
                  title="Remove address field"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={addMoreFields}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            + Add More Addresses
          </button>
          
          <button
            onClick={lookupProperties}
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Looking up...' : 'Lookup Rent Estimates'}
          </button>
        </div>

        {loading && (
          <div className="mt-4 text-sm text-gray-600">
            📡 Looking up properties... This may take a few moments.
          </div>
        )}
      </div>

      {/* Results Section */}
      {results.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-600">Rent Estimates</h2>
            <button
              onClick={exportResults}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700"
            >
              📊 Export CSV
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-3 font-medium text-gray-900">Address</th>
                  <th className="text-right p-3 font-medium text-gray-900">Estimated Rent</th>
                  <th className="text-center p-3 font-medium text-gray-900">Data Sources</th>
                  <th className="text-right p-3 font-medium text-gray-900">Bed/Bath</th>
                  <th className="text-right p-3 font-medium text-gray-900">Sq Ft</th>
                  <th className="text-center p-3 font-medium text-gray-900">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {results.map((result, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="p-3">
                      <div className="font-medium text-gray-600">{result.address}</div>
                      {result.data?.zpid && (
                        <div className="text-xs text-gray-500">ZPID: {result.data.zpid}</div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {result.success && result.data?.rentEstimate ? (
                        <div className="font-medium text-green-600">
                          ${result.data.rentEstimate.toLocaleString()}/mo
                        </div>
                      ) : (
                        <div className="text-gray-400">N/A</div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {result.data?.sources ? (
                        <div className="text-xs">
                          <div className="font-medium text-gray-600">{result.data.sources}</div>
                          {result.data.dataPoints > 1 && (
                            <div className="text-gray-600">({result.data.dataPoints} sources)</div>
                          )}
                          {result.data?.apiResponses && (
                            <button
                              onClick={() => openApiResponseWindow(result.address, result.data.apiResponses)}
                              className="mt-1 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              title="View API responses for debugging"
                            >
                              🔍 Debug API
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">N/A</span>
                      )}
                    </td>
                    <td className="p-3 text-right text-gray-600">
                      {result.data ? `${result.data.bedrooms || '?'}/${result.data.bathrooms || '?'}` : 'N/A'}
                    </td>
                    <td className="p-3 text-right text-gray-600">
                      {result.data?.livingArea ? `${result.data.livingArea.toLocaleString()} sq ft` : 'N/A'}
                    </td>
                    <td className="p-3 text-center">
                      {result.success ? (
                        <span className="inline-block w-3 h-3 bg-green-500 rounded-full" title="Success"></span>
                      ) : (
                        <span className="inline-block w-3 h-3 bg-red-500 rounded-full" title={result.error}></span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 text-xs text-gray-500">
            💡 <strong>Tip:</strong> Click "Export CSV" to download results for further analysis.
            Successful lookups: {results.filter(r => r.success).length} / {results.length}
          </div>
        </div>
      )}
    </main>
  );
}