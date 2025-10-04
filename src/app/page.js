'use client';
import { useEffect, useState } from 'react';
import { analyze } from '@/lib/finance';
import { createRoot } from 'react-dom/client';

const DEFAULTS = {
  address: '', city: '', state: '', zip: '',
  purchasePrice: 500000, downPct: 20, rateApr: 6.5, years: 30,
  monthlyRent: 2800, taxPct: 1.2, hoaMonthly: 0, insuranceMonthly: 120,
  maintPctRent: 5, vacancyPctRent: 5, mgmtPctRent: 8, otherMonthly: 0,
  purchased: false, yearPurchased: '',
  initialInvestment: 0
};

export default function Home() {
  const [form, setForm] = useState(DEFAULTS);
  const [list, setList] = useState([]);
  const [selected, setSelected] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [propertyYears, setPropertyYears] = useState([]);
  const [errMsg, setErrMsg] = useState('');

  const set = (k) => (e) => {
    const t = e.target;
    let v = t.type === 'checkbox' ? t.checked : t.value;
    // keep strings as-is for address/city/state/zip; numeric for numeric fields
    const numericKeys = new Set([
      'purchasePrice','downPct','rateApr','years','monthlyRent','taxPct',
      'hoaMonthly','insuranceMonthly','maintPctRent','vacancyPctRent','mgmtPctRent','otherMonthly','yearPurchased', 'initialInvestment'
    ]);
    setForm({ ...form, [k]: numericKeys.has(k) ? (v === '' ? '' : +v) : v });
  };

  function openComparisonWindow(compareItems) {
    const comparisonWindow = window.open("", "ComparisonWindow", "width=800,height=600");
    comparisonWindow.document.write("<!DOCTYPE html>");
    comparisonWindow.document.write("<html><head><title>Comparison Grid</title></head><body>");
    comparisonWindow.document.write("<div id='comparison-root'></div>");
    comparisonWindow.document.write("</body></html>");

    comparisonWindow.document.close();


    const root = createRoot(comparisonWindow.document.getElementById('comparison-root'));
    root.render(<ComparisonWindow items={compareItems} />);

    // Assuming you are using ReactDOM to render components
    //ReactDOM.render(<ComparisonWindow items={compareItems} />, comparisonWindow.document.getElementById('comparison-root'));
  }

  <button onClick={() => openComparisonWindow(compareItems)}>Open Comparison Grid</button>

  function ComparisonWindow({ items }) {
    return (
      <div>
        <h1>Comparison Grid</h1>
        {/* Render your CompareGrid here */}
        <CompareGrid items={items} />
      </div>
    );
  }
  // Safely read error body from a Response. Some deployments may produce unreadable bodies
  // so we catch and return a helpful string instead of throwing while trying to read it.
  async function readErrorBody(res) {
    try {
      const text = await res.text();
      if (text) return `${res.status} ${res.statusText}: ${text}`;
      return `${res.status} ${res.statusText}`;
    } catch (err) {
      return `${res.status} ${res.statusText} (unable to read response body)`;
    }
  }

  async function load() {
    try {
      const res = await fetch('/api/properties', { cache: 'no-store' });
      if (!res.ok) {
        const body = await readErrorBody(res);
        throw new Error(body);
      }
      setList(await res.json());
    } catch (e) {
      console.error(e);
      setErrMsg('Failed to load properties.');
    }
  }
  useEffect(() => { load(); }, [load]);

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
      if (!res.ok) {
        const body = await readErrorBody(res);
        throw new Error(body);
      }
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
      purchased: !!p.purchased, yearPurchased: p.year_purchased ?? '',
      initialInvestment: +p.initial_investment
    });
    // scroll to top of form if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
    loadYears(p.id);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(DEFAULTS);
    setPropertyYears([]);
  };

  async function loadYears(id) {
    try {
      const res = await fetch(`/api/properties/${id}/years`, { cache: 'no-store' });
      if (!res.ok) {
        const body = await readErrorBody(res);
        throw new Error(body);
      }
      setPropertyYears(await res.json());
    } catch (e) {
      console.error(e);
      setErrMsg('Failed to load yearly records.');
    }
  }

  async function saveYear(entry) {
    if (!editingId) return;
    try {
      const res = await fetch(`/api/properties/${editingId}/years`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry)
      });
      if (!res.ok) {
        const body = await readErrorBody(res);
        throw new Error(body);
      }
      await loadYears(editingId);
    } catch (e) {
      console.error(e);
      setErrMsg('Failed to save year.');
    }
  }

  async function removeYear(year) {
    if (!editingId) return;
    try {
      const res = await fetch(`/api/properties/${editingId}/years/${year}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await readErrorBody(res);
        throw new Error(body);
      }
      await loadYears(editingId);
    } catch (e) {
      console.error(e);
      setErrMsg('Failed to delete year.');
    }
  }

  // compute ROI aggregates when editing
  const totalInvested = (form.purchasePrice && form.downPct) ? (form.purchasePrice * (form.downPct/100)) : 0;
  const sumPreTax = propertyYears.reduce((s, y) => s + (Number(y.income || 0) - Number(y.expenses || 0)), 0);
  const sumAfterTax = propertyYears.reduce((s, y) => s + (Number(y.income || 0) - Number(y.expenses || 0) - Number(y.depreciation || 0)), 0);
  const preTaxROI = totalInvested ? (sumPreTax / totalInvested) : 0;
  const afterTaxROI = totalInvested ? (sumAfterTax / totalInvested) : 0;

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

          <label className="flex items-center justify-between gap-4">
            <span className="text-sm">Initial Investment ($)</span>
            <input
              type="number" step="any"
              className={inputNarrow}
              value={form.initialInvestment}
              onChange={set('initialInvestment')}
            />
          </label>

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

          <label className="flex items-center gap-3">
            <input type="checkbox" checked={!!form.purchased} onChange={set('purchased')} />
            <span className="text-sm">Purchased</span>
            <input type="number" placeholder="Year Purchased" className="w-32 rounded-md border px-2 py-1" value={form.yearPurchased} onChange={set('yearPurchased')} />
          </label>

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
      {list.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-2">Saved Properties</h2>
          <ul className="grid md:grid-cols-2 gap-3">
            {list.map(p => (
              <li key={p.id} className="rounded border p-3 bg-black">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{p.address}</div>
                    <div className="text-[11px] text-black-400">ID: <span className="font-mono">{p.id}</span></div>
                    <div className="text-xs text-gray-500 mt-1">
                      ${Number(p.purchase_price).toLocaleString('en-US')} · Rent ${Number(p.monthly_rent).toLocaleString('en-US')}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button className="text-xs rounded border px-2 py-1" onClick={()=>startEdit(p)}>Edit</button>
                    <button className="text-xs rounded border px-2 py-1" onClick={async ()=>{
                      // confirm and delete
                      if(!confirm(`Delete property ${p.address || p.id}? This cannot be undone.`)) return;
                      try {
                        const res = await fetch(`/api/properties/${p.id}`, { method: 'DELETE' });
                        if(!res.ok) throw new Error(await res.text());
                        // remove from selected if present
                        setSelected(prev => prev.filter(x=>x!==p.id));
                        await load();
                      } catch (e) {
                        console.error(e);
                        setErrMsg('Delete failed.');
                      }
                    }}>Delete</button>
                    <label className="text-xs rounded border px-2 py-1 flex items-center gap-1">
                      <input type="checkbox" checked={selected.includes(p.id)} onChange={()=>toggleSelect(p.id)} />
                      <span className="text-white-800 font-medium">Compare</span>
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Yearly records editor shown when editing a saved property */}
      {editingId && (
        <section className="mt-6">
          <h2 className="text-lg font-medium mb-2">Yearly Records (historical income/expenses)</h2>
          <YearlyRecords years={propertyYears} onSave={saveYear} onDelete={removeYear} />
          <div className="mt-4 rounded-lg border p-3 bg-red">
            <div className="text-sm text-black-400">Total Invested (down payment): ${Number(totalInvested).toLocaleString('en-US')}</div>
            <div className="text-sm">Sum Pre-Tax Net: ${Number(sumPreTax).toLocaleString('en-US')}</div>
            <div className="text-sm">Sum After-Tax Net: ${Number(sumAfterTax).toLocaleString('en-US')}</div>
            <div className="text-sm">Pre-Tax ROI: {(preTaxROI*100).toFixed(2)}%</div>
            <div className="text-sm">After-Tax ROI: {(afterTaxROI*100).toFixed(2)}%</div>
          </div>
        </section>
      )}

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
    initialInvestment: +form.initialInvestment || 0
  });
  const Money = (v) => `$${Number(v).toLocaleString('en-US')}`;
  const Pct = (v) => `${Number(v).toFixed(2)}%`;

  return (
    <div className="rounded-2xl border p-4 shadow-sm bg-black">
      <h2 className="text-lg font-medium mb-2">Current Assumptions</h2>
      <ul className="space-y-1 text-sm">
        <li>Down Payment: {Money(r.down)}</li>
        <li>Loan Amount: {Money(r.loan)}</li>
        <li>Mortgage (P&I): {Money(r.pAndI)} /mo</li>
        <li>Operating Expenses: {Money(r.operatingExpenses)} /mo</li>
        <li>NOI: {Money(r.noiMonthly)} /mo</li>
        <li>Cashflow: {Money(r.cashflowMonthly)} /mo</li>
      </ul>
      {form.purchased && <YearlySummary form={form} />}
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
        initialInvestment: +p.initial_investment || 0
      });
    })()
  }));

  const Money = (v) => `$${Number(v).toLocaleString('en-US')}`;
  const Pct = (v) => `${Number(v).toFixed(2)}%`;

  return (
    <section className="rounded-2xl border p-4 bg-white shadow-sm">
      <h2 className="text-lg font-medium mb-3 text-black">Comparison</h2>
      <div className="overflow-x-auto">
        <table className="min-w-[700px] w-full text-sm text-black">
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

function YearlySummary({ form }) {
  // This component shows a simple ROI estimate based on entered yearly records when editing a saved property.
  // For the preview (unsaved), we can't fetch yearly records — this is a placeholder.
  return (
    <div className="rounded-lg border p-3 mt-3 bg-white text-black">
      <div className="text-sm">Purchased: {form.purchased ? 'Yes' : 'No'}</div>
      {form.purchased && form.yearPurchased && (
        <div className="text-xs text-gray-600">Year Purchased: {form.yearPurchased}</div>
      )}
      <div className="text-sm mt-2">To see historical ROI, edit a saved property and add yearly income/expenses/taxes in the editor.</div>
    </div>
  );
}

function CsvUploader() {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");

    function parseCsv(text) {
      const raw = text.trim().replace(/\r\n?/g, "\n");
      if (!raw) return [];

      // Detect delimiter: tab if any tabs in header, else comma, else semicolon
      const firstLine = raw.split("\n", 1)[0];
      const delim = firstLine.includes("\t") ? "\t" : (firstLine.includes(";") ? ";" : ",");

      const lines = raw.split("\n").filter(Boolean);
      const headers = lines[0].split(delim).map(s => s.trim());

      // Accept propertyId OR address headers
      const has = (k) => headers.includes(k);
      const idx = (k) => headers.indexOf(k);

      const requiredAny = (has("propertyId") || has("address")) && has("year") && has("grossIncome") && has("totalExpenses");
      if (!requiredAny) {
        throw new Error('Header must include year,grossIncome,totalExpenses and either propertyId or address');
      }

      return lines.slice(1).map(line => {
        const cells = line.split(delim).map(s => s.trim());

        // Helper to safely get a number (empty -> 0)
        const num = (i) => {
          if (i < 0) return 0;
          const v = cells[i] ?? "";
          // remove any accidental thousands separators (just in case)
          const cleaned = v.replace(/,/g, "");
          return cleaned === "" ? 0 : Number(cleaned);
        };

        const row = {
          propertyId: has("propertyId") ? Number(cells[idx("propertyId")] || 0) : undefined,
          address: has("address") ? (cells[idx("address")] || "").trim() : undefined,
          year: num(idx("year")),
          grossIncome: num(idx("grossIncome")),
          totalExpenses: num(idx("totalExpenses")),
          depreciation: has("depreciation") ? num(idx("depreciation")) : 0,
        };

        return row;
      }).filter(r => (r.propertyId || r.address) && r.year);
    }

  async function upload(rows) {
    setMsg("Uploading...");
    const res = await fetch("/api/actuals/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    });
    const data = await res.json().catch(()=>({}));
    if (!res.ok) throw new Error(data?.error || res.statusText);
    setMsg(`Uploaded ${data.count} rows`);
  }

  async function onUploadClick() {
    try {
      const rows = parseCsv(text);
      if (!rows.length) { setMsg("No rows found."); return; }
      await upload(rows);
      setText("");
    } catch (e) {
      setMsg(`Error: ${e.message}`);
    }
  }

  async function onFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setText(t);
  }

  return (
    <div className="rounded-2xl border p-4 bg-white shadow-sm text-black">
      <h3 className="text-lg font-medium">Upload Actuals (CSV)</h3>
      <p className="text-sm text-black-700">
        Columns: <code>propertyId,year,grossIncome,totalExpenses,depreciation</code>
      </p>
      <div className="flex items-center gap-3">
        <input type="file" accept=".csv,text/csv" onChange={onFileChange}
               className="text-sm" />
        <button onClick={onUploadClick} className="rounded bg-black text-white px-3 py-2">
          Upload CSV
        </button>
        {msg && <div className="text-sm text-gray-800">{msg}</div>}
      </div>
      <textarea
        className="w-full h-40 rounded-md border border-gray-300 px-3 py-2 text-gray-900"
        placeholder={
`propertyId,year,grossIncome,totalExpenses,depreciation
1,2016,26400,9200,10000
1,2017,26800,9450,10000`
        }
        value={text}
        onChange={(e)=>setText(e.target.value)}
      />
      <p className="text-sm text-gray-600">
        Tip: If your numbers include commas (e.g., 26,400), remove commas or use a CSV that doesn't include
        thousands separators. This simple parser doesn't handle quoted fields.
      </p>
    </div>
  );
}

function YearlyRecords({ years = [], onSave, onDelete }) {
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ year: '', income: 0, expenses: 0, depreciation: 0, notes: '' });

  useEffect(() => {
    if (!editing) {
      setForm({ year: '', income: 0, expenses: 0, depreciation: 0, notes: '' });
    } else {
      setForm({
        year: editing.year || '',
        income: editing.income || 0,
        expenses: editing.expenses || 0,
        depreciation: editing.depreciation || 0,
        notes: editing.notes || ''
      });
    }
  }, [editing, years]);

  const startEdit = (y) => {
    setEditing(y.year);
    setForm({ year: y.year, income: y.income, expenses: y.expenses, depreciation: y.depreciation, notes: y.notes });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!onSave) return;
    await onSave({ year: form.year, income: Number(form.income || 0), expenses: Number(form.expenses || 0), depreciation: Number(form.depreciation || 0), notes: form.notes });
    setEditing(null);
  };

  return (
    <div>
      <form onSubmit={submit} className="grid grid-cols-6 gap-2 mb-3">
        <input className="col-span-1 rounded border px-2 py-1" placeholder="Year" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} required />
        <input className="col-span-1 rounded border px-2 py-1" placeholder="Income" value={form.income} onChange={(e) => setForm({ ...form, income: e.target.value })} />
        <input className="col-span-1 rounded border px-2 py-1" placeholder="Expenses" value={form.expenses} onChange={(e) => setForm({ ...form, expenses: e.target.value })} />
        <input className="col-span-1 rounded border px-2 py-1" placeholder="Depreciation" value={form.depreciation} onChange={(e) => setForm({ ...form, depreciation: e.target.value })} />
        <input className="col-span-1 rounded border px-2 py-1" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="col-span-1">
          <button className="rounded bg-black text-white px-3 py-1 text-sm">Save</button>
        </div>
      </form>

      <ul className="space-y-2">
        {years.map(y => (
          <li key={y.year} className="flex items-center justify-between rounded border p-2 bg-white">
            <div>
              <div className="font-medium text-gray-800">{y.year}</div>
              <div className="text-xs text-gray-800">Income: ${Number(y.income).toLocaleString('en-US')} · Expenses: ${Number(y.expenses).toLocaleString('en-US')} · Depreciation: ${Number(y.depreciation).toLocaleString('en-US')}</div>
            </div>
            <div className="flex gap-2">
              <button className="text-sm rounded border px-2 py-1 text-gray-800" onClick={() => startEdit(y)}>Edit</button>
              <button className="text-sm rounded border px-2 py-1 bg-red-50 text-red-700" onClick={() => onDelete(y.year)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
