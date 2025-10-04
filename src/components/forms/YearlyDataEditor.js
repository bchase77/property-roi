import React, { useState, useEffect } from 'react';

export default function YearlyDataEditor({ property, onUpdate }) {
  const [yearlyData, setYearlyData] = useState([]);
  const [form, setForm] = useState({ year: '', income: '', expenses: '', depreciation: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (property) {
      loadYearlyData();
    }
  }, [property]);

  async function loadYearlyData() {
    try {
      const res = await fetch(`/api/properties/${property.id}/years`);
      if (res.ok) {
        setYearlyData(await res.json());
      }
    } catch (error) {
      console.error('Failed to load yearly data:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const res = await fetch(`/api/properties/${property.id}/years`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: parseInt(form.year),
          income: parseFloat(form.income) || 0,
          expenses: parseFloat(form.expenses) || 0,
          depreciation: parseFloat(form.depreciation) || 0
        }),
      });
      
      if (res.ok) {
        setForm({ year: '', income: '', expenses: '', depreciation: '' });
        await loadYearlyData();
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to save yearly data:', error);
    }
  };

  const handleDelete = async (year) => {
    if (!confirm(`Delete data for ${year}?`)) return;
    
    try {
      const res = await fetch(`/api/properties/${property.id}/years/${year}`, {
        method: 'DELETE'
      });
      
      if (res.ok) {
        await loadYearlyData();
        onUpdate();
      }
    } catch (error) {
      console.error('Failed to delete yearly data:', error);
    }
  };

  const inputCls = "rounded border border-gray-300 px-2 py-1 text-sm";

  if (loading) {
    return <div className="text-center py-4">Loading yearly data...</div>;
  }

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-600">Yearly Financial Data</h3>
      
      {/* Add New Year Form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-5 gap-2 mb-4">
        <input 
          className={inputCls + ' text-gray-600'}
          placeholder="Year"
          value={form.year}
          onChange={(e) => setForm({...form, year: e.target.value})}
          required
        />
        <input 
          className={inputCls + ' text-gray-600'}
          placeholder="Income ($)"
          value={form.income}
          onChange={(e) => setForm({...form, income: e.target.value})}
        />
        <input 
          className={inputCls + ' text-gray-600'}
          placeholder="Expenses ($)"
          value={form.expenses}
          onChange={(e) => setForm({...form, expenses: e.target.value})}
        />
        <input 
          className={inputCls + ' text-gray-600'}
          placeholder="Depreciation ($)"
          value={form.depreciation}
          onChange={(e) => setForm({...form, depreciation: e.target.value})}
        />
        <button 
          type="submit"
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
        >
          Add
        </button>
      </form>

      {/* Yearly Data List */}
      {yearlyData.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No yearly data yet. Add some above.</p>
      ) : (
        <div className="space-y-2">
          {yearlyData.map(data => (
            <div key={data.year} className="flex items-center justify-between bg-gray-50 rounded p-3">
              <div>
                <div className="font-medium text-gray-600">{data.year}</div>
                <div className="text-sm text-gray-600">
                  Income: ${Number(data.income || 0).toLocaleString()} • 
                  Expenses: ${Number(data.expenses || 0).toLocaleString()} • 
                  Depreciation: ${Number(data.depreciation || 0).toLocaleString()}
                </div>
                <div className="text-sm font-medium">
                  Net: ${(Number(data.income || 0) - Number(data.expenses || 0)).toLocaleString()}
                </div>
              </div>
              <button 
                onClick={() => handleDelete(data.year)}
                className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}