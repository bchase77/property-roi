import React, { useState } from 'react';

export default function OriginalValues({ form, updateForm, inputCls }) {
  const [showOriginalValues, setShowOriginalValues] = useState(false);

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    const numericKeys = new Set([
      'original30yAtroi', 'originalMonthlyRent', 'originalPropertyTaxPct', 'originalInsuranceMonthly',
      'originalMaintenancePctRent', 'originalVacancyPctRent', 'originalManagementPctRent'
    ]);
    
    const processedValue = numericKeys.has(key) 
      ? (value === '' ? '' : Number(value)) 
      : value;
    
    updateForm({ [key]: processedValue });
  };

  // Auto-populate from current values if original values are empty
  const autoPopulateOriginalValues = () => {
    const updates = {};
    
    if (!form.originalMonthlyRent && form.monthlyRent) {
      updates.originalMonthlyRent = form.monthlyRent;
    }
    if (!form.originalPropertyTaxPct && form.taxPct) {
      updates.originalPropertyTaxPct = form.taxPct;
    }
    if (!form.originalInsuranceMonthly && form.insuranceMonthly) {
      updates.originalInsuranceMonthly = form.insuranceMonthly;
    }
    if (!form.originalMaintenancePctRent && form.maintPctRent) {
      updates.originalMaintenancePctRent = form.maintPctRent;
    }
    if (!form.originalVacancyPctRent && form.vacancyPctRent) {
      updates.originalVacancyPctRent = form.vacancyPctRent;
    }
    if (!form.originalManagementPctRent && form.mgmtPctRent) {
      updates.originalManagementPctRent = form.mgmtPctRent;
    }
    if (!form.originalCalculationDate) {
      updates.originalCalculationDate = new Date().toISOString().split('T')[0];
    }
    
    if (Object.keys(updates).length > 0) {
      updateForm(updates);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">
            Historical Analysis (Original Purchase Values)
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            Enter your original purchase-time values to compare projected vs actual performance
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={autoPopulateOriginalValues}
            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200"
          >
            📋 Copy from Current
          </button>
          <button
            type="button"
            onClick={() => setShowOriginalValues(!showOriginalValues)}
            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            {showOriginalValues ? '📖 Hide' : '📅 Show Original Values'}
          </button>
        </div>
      </div>

      {showOriginalValues && (
        <div className="space-y-6">
          {/* Original 30y ATROI Input */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-lg font-medium text-blue-900 mb-3">Your Original 30yATROI Calculation</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Original 30y ATROI (%)
                  <span className="text-xs text-gray-500 ml-1">Your calculated result</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.original30yAtroi || ''}
                  onChange={set('original30yAtroi')}
                  className={inputCls}
                  placeholder="e.g. 14.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Calculation Date
                  <span className="text-xs text-gray-500 ml-1">When you calculated this</span>
                </label>
                <input
                  type="date"
                  value={form.originalCalculationDate || ''}
                  onChange={set('originalCalculationDate')}
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Original Property Values */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Original Income & Expenses</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Original Monthly Rent ($)
                </label>
                <input
                  type="number"
                  value={form.originalMonthlyRent || ''}
                  onChange={set('originalMonthlyRent')}
                  className={inputCls}
                  placeholder="Original rent amount"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Original Property Tax (%)
                  <span className="text-xs text-gray-500 ml-1">Annual % of purchase price</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.originalPropertyTaxPct || ''}
                  onChange={set('originalPropertyTaxPct')}
                  className={inputCls}
                  placeholder="e.g. 1.2"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Original Insurance ($/month)
                </label>
                <input
                  type="number"
                  value={form.originalInsuranceMonthly || ''}
                  onChange={set('originalInsuranceMonthly')}
                  className={inputCls}
                  placeholder="Original monthly insurance"
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900">Original Expense Percentages</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Original Maintenance (% of rent)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.originalMaintenancePctRent || ''}
                  onChange={set('originalMaintenancePctRent')}
                  className={inputCls}
                  placeholder="e.g. 5.0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Original Vacancy (% of rent)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.originalVacancyPctRent || ''}
                  onChange={set('originalVacancyPctRent')}
                  className={inputCls}
                  placeholder="e.g. 5.0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Original Management (% of rent)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={form.originalManagementPctRent || ''}
                  onChange={set('originalManagementPctRent')}
                  className={inputCls}
                  placeholder="e.g. 8.0"
                />
              </div>
            </div>
          </div>

          {/* Comparison Preview */}
          {(form.original30yAtroi || form.originalMonthlyRent) && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-800 mb-2">📊 Original vs Current Preview</h3>
              <div className="grid grid-cols-3 gap-4 text-sm">
                {form.original30yAtroi && (
                  <div>
                    <div className="text-gray-600">30y ATROI</div>
                    <div className="font-medium">
                      <span className="text-blue-600">Original: {form.original30yAtroi}%</span>
                      <br />
                      <span className="text-gray-600">Current: [Calculated]</span>
                    </div>
                  </div>
                )}
                {form.originalMonthlyRent && (
                  <div>
                    <div className="text-gray-600">Monthly Rent</div>
                    <div className="font-medium">
                      <span className="text-blue-600">Original: ${form.originalMonthlyRent?.toLocaleString()}</span>
                      <br />
                      <span className="text-gray-600">Current: ${form.monthlyRent?.toLocaleString()}</span>
                    </div>
                  </div>
                )}
                {form.originalPropertyTaxPct && (
                  <div>
                    <div className="text-gray-600">Property Tax %</div>
                    <div className="font-medium">
                      <span className="text-blue-600">Original: {form.originalPropertyTaxPct}%</span>
                      <br />
                      <span className="text-gray-600">Current: {form.taxPct}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}