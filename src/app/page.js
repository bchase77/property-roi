'use client';
import { useEffect, useState } from 'react';
import { analyze } from '@/lib/finance';

const DEFAULTS = {
  address: '', city: '', state: '', zip: '',
  purchasePrice: 500000, downPct: 20, rateApr: 6.5, years: 30,
  monthlyRent: 2800, taxPct: 1.2, hoaMonthly: 0, insuranceMonthly: 120,
  maintPctRent: 5, vacancyPctRent: 5, mgmtPctRent: 8, otherMonthly: 0,
};

export default function Home() {
  const [form, setForm] = useState(DEFAULTS);
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [errMsg, setErrMsg] = useState('');

  const set = (k) => (e) => {
    const v = e.target.value;
    // keep strings as-is for address/city/state/zip; numeric for numeric fields
    const numericKeys = new Set([
      'purchasePrice','downPct','rateApr','years','monthlyRent','taxPct',
      'hoaMonthly','insuranceMonthly','maintPctRent','vacancyPctRent','mgmtPctRent','otherMonthly'
    ]);
    setForm({ ...form, [k]: numericKeys.has(k) ? (v === '' ? '' : +v) : v });
  };

  async function load() {
    try {
      const res = await fetch('/api/properties', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      setList(await res.json());
    } catch (e) {
      console.error(e);
      setErrMsg('Failed to load properties.');
    }
  }
  useEffect(() => { load(); }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setErrMsg('');
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `/api/properties/${editingId}` : '/api/properties';
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(await res.text());
      setForm(DEFAULTS);
      setEditingId(null);
      await load();
    } catch (err) {
      console.error(err);
      setErrMsg('Save failed.');
    }
  }

  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({
      address: p.address ?? '', city: p.city ?? '', state: p.state ?? '', zip: p.zip ?? '',
      purchasePrice: +p.purchase_price, downPct: +p.down_payment_pct, rateApr: +p.interest_apr_pct,
      years: +p.loan_years, monthlyRent: +p.monthly_rent, taxPct: +p.property_tax_pct,
      hoaMonthly: +p.hoa_monthly, insuranceMonthly: +p.insurance_monthly,
      maintPctRent: +p.maintenance_pct_rent, vacancyPctRent: +p.vacancy_pct_rent,
      mgmtPctRent: +p.management_pct_rent, otherMonthly: +p.other_monthly,
    });
    // scroll to top of form if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(DEFAULTS);
  };

  const toggleSelect = (id) =>
    setSelected((prev) => prev.includes(id) ? prev.filter(x=>x!==id) : [...prev, id]);

  const compareItems = list.filter(p => selected.includes(p.id));

  // helper classes for readable inputs
  const inputCls = "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/20";
  const inputNarrow = "w-40 rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-black/20";

  return (
    <main className="mx-auto max-w-6xl p-6 space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Property ROI</h1>
          <p className="text-sm text-gray-500">Save properties and compare ROI side-by-side.</p>
        </div>
        {editingId && (
          <div className="text-xs text-gray-500">Editing ID: <span className="font-mono">{editingId}</span></div>
        )}
      </header>

      {errMsg && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{errMsg}</div>}

      {/* Form */}
      <form onSubmit={onSubmit} className="grid md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="block text-sm">Address
            <input className={inputCls} value={form.address} onChange={set('address')} required />
          </label>
          <div className="grid grid-cols-3 gap-2">
            <input placeholder="City" className={inputCls} value={form.city} onChange={set('city')} />
            <input placeholder="State" className={inputCls} value={form.state} onChange={set('state')} />
            <input placeholder="ZIP" className={inputCls} value={form.zip} onChange={set('zip')} />
          </div>

          {[
            ['purchasePrice','Purchase Price ($)'],
            ['downPct','Down (%)'],
            ['rateApr','Rate APR (%)'],
            ['years','Loan Years'],
            ['monthlyRent','Rent ($/mo)'],
            ['taxPct','Property Tax (%)'],
            ['hoaMonthly','HOA ($/mo)'],
            ['insuranceMonthly','Insurance ($/mo)'],
            ['maintPctRent','Maintenance (% rent)'],
            ['vacancyPctRent','Vacancy (% rent)'],
            ['mgmtPctRent','Mgmt (% rent)'],
            ['otherMonthly','Other ($/mo)'],
          ].map(([k,label])=>(
            <label key={k} className="flex items-center justify-between gap-4">
              <span className="text-sm">{label}</span>
              <input type="number" step="any" className={inputNarrow} value={form[k]} onChange={set(k)} />
            </label>
          ))}

          <div className="flex gap-2">
            <button className="rounded bg-black text-white px-3 py-2">
              {editingId ? 'Update Property' : 'Save Property'}
            </button>
            {editingId && (
              <button type="button" className="rounded border px-3 py-2" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Live preview of ROI for current inputs */}
        <Preview form={form} />
      </form>

      {/* List & select */}
      <section>
        <h2 className="text-lg font-medium mb-2">Saved Properties</h2>
        <ul className="grid md:grid-cols-2 gap-3">
          {list.map(p => (
            <li key={p.id} className="rounded border p-3 bg-white">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium">{p.address}</div>
                  <div className="text-[11px] text-gray-400">ID: <span className="font-mono">{p.id}</span></div>
                  <div className="text-xs text-gray-500 mt-1">
                    ${Number(p.purchase_price).toLocaleString()} · Rent ${Number(p.monthly_rent).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="text-xs rounded border px-2 py-1" onClick={()=>startEdit(p)}>Edit</button>
                  <label className="text-xs rounded border px-2 py-1 flex items-center gap-1">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggleSelect(p.id)} />
                    Compare
                  </label>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Comparison table */}
      {compareItems.length > 0 && <CompareGrid items={compareItems} />}
    </main>
  );
}

function Preview({ form }) {
  const r = analyze({
    purchasePrice: +form.purchasePrice || 0,
    downPct: +form.downPct || 0,
    rateApr: +form.rateApr || 0,
    years: +form.years || 0,
    monthlyRent: +form.monthlyRent || 0,
    taxPct: +form.taxPct || 0,
    hoaMonthly: +form.hoaMonthly || 0,
    insuranceMonthly: +form.insuranceMonthly || 0,
    maintPctRent: +form.maintPctRent || 0,
    vacancyPctRent: +form.vacancyPctRent || 0,
    mgmtPctRent: +form.mgmtPctRent || 0,
    otherMonthly: +form.otherMonthly || 0,
  });
  const Money = (v) => `$${Number(v).toLocaleString()}`;
  const Pct = (v) => `${Number(v).toFixed(2)}%`;

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-white">
      <h2 className="text-lg font-medium mb-2">Current Assumptions</h2>
      <ul className="space-y-1 text-sm">
        <li>Down Payment: {Money(r.down)}</li>
        <li>Loan Amount: {Money(r.loan)}</li>
        <li>Mortgage (P&I): {Money(r.pAndI)} /mo</li>
        <li>Operating Expenses: {Money(r.operatingExpenses)} /mo</li>
        <li>NOI: {Money(r.noiMonthly)} /mo</li>
        <li>Cashflow: {Money(r.cashflowMonthly)} /mo</li>
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-3 text-center">
        <Metric label="Cap Rate" value={Pct(r.metrics.capRate)} />
        <Metric label="Cash-on-Cash" value={Pct(r.metrics.cashOnCash)} />
        <Metric label="DSCR" value={r.metrics.dscr} />
        <Metric label="Gross Yield" value={Pct(r.metrics.grossYield)} />
      </div>
    </div>
  );
}
function Metric({ label, value }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-xl">{value}</div>
    </div>
  );
}

function CompareGrid({ items }) {
  // compute metrics per saved row
  const rows = items.map(p => ({
    id: p.id,
    address: p.address,
    m: (()=>{
      return analyze({
        purchasePrice: +p.purchase_price, downPct: +p.down_payment_pct,
        rateApr: +p.interest_apr_pct, years: +p.loan_years,
        monthlyRent: +p.monthly_rent, taxPct: +p.property_tax_pct,
        hoaMonthly: +p.hoa_monthly, insuranceMonthly: +p.insurance_monthly,
        maintPctRent: +p.maintenance_pct_rent, vacancyPctRent: +p.vacancy_pct_rent,
        mgmtPctRent: +p.management_pct_rent, otherMonthly: +p.other_monthly,
      });
    })()
  }));

  const Money = (v) => `$${Number(v).toLocaleString()}`;
  const Pct = (v) => `${Number(v).toFixed(2)}%`;

  return (
    <section className="rounded-2xl border p-4 bg-white shadow-sm">
      <h2 className="text-lg font-medium mb-3">Comparison</h2>
      <div className="overflow-x-auto">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="text-left">
            <tr>
              <th className="p-2">Property</th>
              {rows.map(r => <th key={r.id} className="p-2">{r.address}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              ['Price', (r)=>Money(r.m.loan + r.m.down)],
              ['Down Payment', (r)=>Money(r.m.down)],
              ['Mortgage (P&I) /mo', (r)=>Money(r.m.pAndI)],
              ['Operating Exp /mo', (r)=>Money(r.m.operatingExpenses)],
              ['NOI /mo', (r)=>Money(r.m.noiMonthly)],
              ['Cashflow /mo', (r)=>Money(r.m.cashflowMonthly)],
              ['Cap Rate', (r)=>Pct(r.m.metrics.capRate)],
              ['Cash-on-Cash', (r)=>Pct(r.m.metrics.cashOnCash)],
              ['DSCR', (r)=>r.m.metrics.dscr],
              ['Gross Yield', (r)=>Pct(r.m.metrics.grossYield)],
            ].map(([label, fn])=>(
              <tr key={label} className="border-t">
                <td className="p-2 font-medium">{label}</td>
                {rows.map(r => <td key={r.id} className="p-2">{fn(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

