'use client';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '@/components/ui/PageHeader';
import { analyze } from '@/lib/finance';

// Quick sensitivity calc using the same finance.analyze() logic
function calcAt(prop, rent) {
  if (!rent || !prop.purchase_price) return null;
  try {
    return analyze({
      purchasePrice:   Number(prop.purchase_price),
      downPct:         Number(prop.down_payment_pct),
      rateApr:         Number(prop.interest_apr_pct),
      years:           Number(prop.loan_years),
      monthlyRent:     rent,
      taxPct:          Number(prop.property_tax_pct),
      taxAnnual:       Number(prop.tax_annual ?? 0),
      taxInputMode:    prop.tax_input_mode ?? 'percentage',
      hoaMonthly:      Number(prop.hoa_monthly ?? 0),
      insuranceMonthly: Number(prop.insurance_monthly ?? 0),
      maintPctRent:    Number(prop.maintenance_pct_rent ?? 0),
      vacancyPctRent:  Number(prop.vacancy_pct_rent ?? 0),
      mgmtPctRent:     Number(prop.management_pct_rent ?? 0),
      otherMonthly:    Number(prop.other_monthly ?? 0),
      initialInvestment: Number(prop.initial_investment ?? 0),
      closingCosts:    Number(prop.closing_costs ?? 0),
      repairCosts:     Number(prop.repair_costs ?? 0),
      mortgageFree:    prop.mortgage_free ?? false,
      propertyAddress: prop.address,
    });
  } catch { return null; }
}

function avg(min, max) {
  if (min != null && max != null) return Math.round((min + max) / 2);
  if (min != null) return min;
  if (max != null) return max;
  return null;
}

function fmt$(n) {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString();
}
function fmtPct(n) {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}

function SensitivityBadge({ prop, rent, label, color }) {
  const m = rent ? calcAt(prop, rent) : null;
  if (!m) return <span className="text-gray-300 text-xs">—</span>;
  const cfColor = m.cashFlow >= 0 ? 'text-green-700' : 'text-red-600';
  const atColor = m.metrics?.atROI30y >= 10 ? 'text-green-700' : m.metrics?.atROI30y >= 5 ? 'text-yellow-600' : 'text-red-600';
  return (
    <div className={`text-xs rounded px-2 py-1 ${color} text-center min-w-[80px]`}>
      <div className="font-semibold text-gray-500 mb-0.5">{label} {fmt$(rent)}</div>
      <div className={`font-bold ${cfColor}`}>{m.cashFlow >= 0 ? '+' : ''}{fmt$(m.cashFlow)}/mo</div>
      <div className={atColor}>{fmtPct(m.metrics?.atROI30y)} ATROI</div>
    </div>
  );
}

export default function RentResearchPage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [edits, setEdits] = useState({});

  useEffect(() => {
    fetch('/api/properties')
      .then(r => r.json())
      .then(data => {
        setProperties(data);
        const init = {};
        data.forEach(p => {
          init[p.id] = {
            rentMin:   p.rent_min   != null ? String(p.rent_min)   : '',
            rentMax:   p.rent_max   != null ? String(p.rent_max)   : '',
            rentNotes: p.rent_research_notes ?? '',
          };
        });
        setEdits(init);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const save = useCallback(async (id) => {
    const e = edits[id];
    if (!e) return;
    setSaving(s => ({ ...s, [id]: true }));
    const body = {
      id,
      rentMin:   e.rentMin   !== '' ? Number(e.rentMin)   : null,
      rentMax:   e.rentMax   !== '' ? Number(e.rentMax)   : null,
      rentNotes: e.rentNotes || null,
    };
    try {
      await fetch('/api/rent-research', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setProperties(ps => ps.map(p => p.id === id
        ? { ...p, rent_min: body.rentMin, rent_max: body.rentMax, rent_research_notes: body.rentNotes }
        : p
      ));
    } catch (err) {
      console.error(err);
    }
    setSaving(s => ({ ...s, [id]: false }));
  }, [edits]);

  const set = (id, field, val) => setEdits(e => ({ ...e, [id]: { ...e[id], [field]: val } }));

  if (loading) return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <PageHeader title="Rent Research" currentPage="/rent-research" />
      <p className="text-gray-400">Loading…</p>
    </main>
  );

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <PageHeader title="Rent Research" subtitle="Set min/max rent ranges and see how they affect your metrics" currentPage="/rent-research" />

      <div className="bg-gray-800 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="px-4 py-3 font-medium">Property</th>
              <th className="px-4 py-3 font-medium">Current Rent</th>
              <th className="px-4 py-3 font-medium">Min $/mo</th>
              <th className="px-4 py-3 font-medium">Max $/mo</th>
              <th className="px-4 py-3 font-medium">Avg</th>
              <th className="px-4 py-3 font-medium">Source / Notes</th>
              <th className="px-4 py-3 font-medium">Sensitivity</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {properties.map(p => {
              const e = edits[p.id] ?? { rentMin: '', rentMax: '', rentNotes: '' };
              const minVal  = e.rentMin  !== '' ? Number(e.rentMin)  : null;
              const maxVal  = e.rentMax  !== '' ? Number(e.rentMax)  : null;
              const avgVal  = avg(minVal, maxVal);
              const isDirty = String(p.rent_min ?? '') !== (e.rentMin ?? '')
                           || String(p.rent_max ?? '') !== (e.rentMax ?? '')
                           || (p.rent_research_notes ?? '') !== (e.rentNotes ?? '');

              return (
                <tr key={p.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-white">{p.address}</div>
                    <div className="text-gray-400 text-xs">{p.city}{p.state ? `, ${p.state}` : ''} · {p.bedrooms}bd/{p.bathrooms}ba</div>
                  </td>
                  <td className="px-4 py-3 text-gray-300 font-mono">
                    {fmt$(p.monthly_rent)}<span className="text-gray-500">/mo</span>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={e.rentMin}
                      onChange={ev => set(p.id, 'rentMin', ev.target.value)}
                      onBlur={() => isDirty && save(p.id)}
                      placeholder="1100"
                      className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      value={e.rentMax}
                      onChange={ev => set(p.id, 'rentMax', ev.target.value)}
                      onBlur={() => isDirty && save(p.id)}
                      placeholder="1500"
                      className="w-24 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {avgVal != null
                      ? <span className="font-bold text-purple-300">{fmt$(avgVal)}</span>
                      : <span className="text-gray-500">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={e.rentNotes}
                      onChange={ev => set(p.id, 'rentNotes', ev.target.value)}
                      onBlur={() => isDirty && save(p.id)}
                      placeholder="Zillow, Rentometer, comp at 123 Main…"
                      className="w-48 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-xs focus:outline-none focus:border-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      <SensitivityBadge prop={p} rent={minVal}  label="Min" color="bg-gray-700" />
                      <SensitivityBadge prop={p} rent={avgVal}  label="Avg" color="bg-purple-900/50" />
                      <SensitivityBadge prop={p} rent={maxVal}  label="Max" color="bg-gray-700" />
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {saving[p.id]
                      ? <span className="text-blue-400 text-xs">saving…</span>
                      : isDirty
                        ? <button onClick={() => save(p.id)} className="text-xs bg-blue-600 hover:bg-blue-500 text-white px-2 py-1 rounded">Save</button>
                        : <span className="text-green-500 text-xs">✓</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
