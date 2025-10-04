import React, { useState } from 'react';

export default function PropertyEditor({ property, onUpdate, onCancel }) {
  const [form, setForm] = useState({
    address: property.address || '',
    city: property.city || '',
    state: property.state || '',
    zip: property.zip || '',
    purchasePrice: property.purchase_price || 0,
    downPct: property.down_payment_pct || 20,
    rateApr: property.interest_apr_pct || 6.5,
    years: property.loan_years || 30,
    monthlyRent: property.monthly_rent || 0,
    taxPct: property.property_tax_pct || 1.2,
    hoaMonthly: property.hoa_monthly || 0,
    insuranceMonthly: property.insurance_monthly || 120,
    maintPctRent: property.maintenance_pct_rent || 5,
    vacancyPctRent: property.vacancy_pct_rent || 5,
    mgmtPctRent: property.management_pct_rent || 8,
    otherMonthly: property.other_monthly || 0,
    initialInvestment: property.initial_investment || 0,
    mortgageFree: property.mortgage_free || false,
    purchased: property.purchased || false,
    yearPurchased: property.year_purchased || ''
  });

  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      
      if (!res.ok) {
        throw new Error('Failed to update property');
      }
      
      onUpdate(await res.json());
    } catch (error) {
      console.error('Failed to update property:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const inputCls = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="bg-white rounded-lg border p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-600">Edit Property Details</h3>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <input 
            className={inputCls}
            value={form.address}
            onChange={handleChange('address')}
            required
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <input 
            placeholder="City"
            className={inputCls}
            value={form.city}
            onChange={handleChange('city')}
          />
          <input 
            placeholder="State"
            className={inputCls}
            value={form.state}
            onChange={handleChange('state')}
          />
          <input 
            placeholder="ZIP"
            className={inputCls}
            value={form.zip}
            onChange={handleChange('zip')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price ($)</label>
          <input 
            type="number"
            className={inputCls}
            value={form.purchasePrice}
            onChange={handleChange('purchasePrice')}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Rent ($)</label>
          <input 
            type="number"
            className={inputCls}
            value={form.monthlyRent}
            onChange={handleChange('monthlyRent')}
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <input 
              type="checkbox"
              id="purchased"
              checked={form.purchased}
              onChange={handleChange('purchased')}
              className="rounded"
            />
            <label htmlFor="purchased" className="text-sm font-medium text-gray-700">
              Already Purchased
            </label>
          </div>

          {form.purchased && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Year Purchased</label>
              <input 
                type="number"
                min="1900"
                max="2030"
                className="w-32 rounded-md border text-gray-600 border-gray-300 px-3 py-2"
                value={form.yearPurchased}
                onChange={handleChange('yearPurchased')}
                placeholder="2023"
              />
            </div>
          )}

          <div className="flex items-center space-x-2">
            <input 
              type="checkbox"
              id="mortgageFree"
              checked={form.mortgageFree}
              onChange={handleChange('mortgageFree')}
              className="rounded"
            />
            <label htmlFor="mortgageFree" className="text-sm font-medium text-gray-700">
              Mortgage-Free
            </label>
          </div>
        </div>

        <div className="flex space-x-3 pt-4">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Update Property'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}