import { useState } from 'react';

export default function ScoutCandidatesPanel({ candidates, hiddenCount, onHide, onShowHidden }) {
  const [checked, setChecked] = useState(new Set());

  if (candidates.length === 0 && hiddenCount === 0) return null;

  const toggle = mlsNum => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(mlsNum)) next.delete(mlsNum);
      else next.add(mlsNum);
      return next;
    });
  };

  const handleHide = () => {
    onHide(checked);
    setChecked(new Set());
  };

  return (
    <div className="bg-white rounded-lg border p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-600">Scout Candidates (graded B)</h2>
        {hiddenCount > 0 && (
          <button onClick={onShowHidden} className="text-sm text-blue-600 hover:underline">
            Show hidden ({hiddenCount})
          </button>
        )}
      </div>

      {candidates.length === 0 ? (
        <p className="text-gray-700 text-sm">No visible Scout candidates.</p>
      ) : (
        <>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {candidates.map(c => (
              <label
                key={c._mlsNum}
                className="flex items-start gap-2 border rounded-lg p-3 cursor-pointer border-gray-200 hover:border-gray-300"
              >
                <input
                  type="checkbox"
                  className="mt-1 rounded"
                  checked={checked.has(c._mlsNum)}
                  onChange={() => toggle(c._mlsNum)}
                />
                <div className="flex-1">
                  <div className="font-medium text-sm text-gray-900">{c.address}</div>
                  <div className="text-xs text-gray-500 mb-1">{c.city}</div>
                  <div className="text-xs text-gray-700">
                    ${Number(c.purchase_price).toLocaleString()} • ${Number(c.monthly_rent).toLocaleString()}/mo
                  </div>
                </div>
              </label>
            ))}
          </div>
          <button
            onClick={handleHide}
            disabled={checked.size === 0}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg"
          >
            Hide Selected{checked.size > 0 ? ` (${checked.size})` : ''}
          </button>
          <p className="text-xs text-gray-500 mt-2">
            Hide candidates that are no longer available (sold/delisted). This only affects this browser.
          </p>
        </>
      )}
    </div>
  );
}
