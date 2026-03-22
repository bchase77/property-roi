'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';

const DEFAULTS = {
  downPct: 25, rateApr: 6.4, loanYears: 30,
  closingCostsPct: 3, repairCosts: 5000,
  taxPct: 2.1, insuranceMonthly: 150,
  maintPctRent: 5, vacancyPctRent: 5, mgmtPctRent: 8,
  rentPerSqft: 1.00,
};

function calcM(listing, mark, A) {
  const price = Number(listing.price);
  const hoa = mark?.hoa_quarterly != null ? mark.hoa_quarterly / 3 : 0;
  const rep = mark?.repair_costs ?? A.repairCosts;
  const rentBase = mark?.rent_override
    || (mark?.rent_min != null && mark?.rent_max != null ? Math.round((mark.rent_min + mark.rent_max) / 2) : null)
    || (mark?.rent_min ?? mark?.rent_max)
    || (listing.sqft ? Math.round(listing.sqft * A.rentPerSqft) : 0);
  const rent = rentBase;
  if (!price || !rent) return null;
  const down = price * (A.downPct / 100);
  const cc = price * (A.closingCostsPct / 100);
  const paid = down + cc + rep;
  const loan = price - down;
  const r = A.rateApr / 100 / 12, n = A.loanYears * 12;
  const pI = loan * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const tax = (price * (A.taxPct / 100)) / 12;
  const ins = A.insuranceMonthly;
  const mgmt = rent * (A.mgmtPctRent / 100);
  const maint = rent * (A.maintPctRent / 100);
  const vac = rent * (A.vacancyPctRent / 100);
  const opEx = tax + hoa + ins + maint + vac + mgmt;
  const cf = Math.round(rent - (pI + opEx));
  const noi = rent - (opEx - vac);
  const capRaw = Math.round((noi * 12 / price) * 1000) / 10;
  const cap = Number.isFinite(capRaw) ? capRaw : null;
  const cocRaw = paid > 0 ? Math.round((cf * 12 / paid) * 1000) / 10 : null;
  const coc = Number.isFinite(cocRaw) ? cocRaw : null;
  const yrs = 30, eff = rent * (1 - A.vacancyPctRent / 100);
  const tv = price + eff * 12 * yrs;
  let te = paid + rent * 12 * (A.mgmtPctRent / 100) * yrs + pI * 12 * yrs + tax * 12 * yrs + rent * 12 * (A.maintPctRent / 100) * yrs + ins * 12 * yrs + hoa * 12 * yrs;
  const depr = (price + cc + rep + ins * 12) / 27.5 / 12;
  te += Math.max(0, (eff - rent * (A.mgmtPctRent / 100) - rent * (A.maintPctRent / 100) - ins - depr - tax) * 0.44) * 12 * yrs;
  const atroiRaw = paid > 0 ? Math.round(((tv - te) / paid / yrs) * 1000) / 10 : 0;
  const atroi = Number.isFinite(atroiRaw) ? atroiRaw : null;
  return { cf, cap, coc, atroi, rent: Math.round(rent) };
}

function fmt$(n) {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString();
}
function fmtPct(n) {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}

function AtroiBadge({ value }) {
  if (value == null) return <span className="text-gray-500">—</span>;
  const color = value >= 10 ? 'bg-purple-900/60 text-purple-300' : value >= 5 ? 'bg-yellow-900/60 text-yellow-300' : 'bg-red-900/60 text-red-300';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>{value.toFixed(1)}%</span>;
}

const PAGE_SIZE = 50;

export default function ScoutPage() {
  const router = useRouter();
  const [listings, setListings] = useState([]);
  const [config, setConfig] = useState(null);
  const [configDraft, setConfigDraft] = useState({});
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  // Local edits per mls_num (committed values — used for metrics/sorting)
  const [localEdits, setLocalEdits] = useState({});

  // Raw typing buffer — updated on every keystroke but NOT used for metrics/sorting
  // This prevents re-sorting mid-type which was causing the 1-digit bug
  const [inputValues, setInputValues] = useState({});

  // Undo stack: [{mls_num, field, prevValue, label}]
  const [undoStack, setUndoStack] = useState([]);

  // Manual-add modal
  const [addOpen, setAddOpen] = useState(false);
  const EMPTY_FORM = { address: '', price: '', beds: '', baths: '', sqft: '', year_built: '', hoa_yn: '', href: '', rent_override: '', repair_costs: '', hoa_quarterly: '', notes: '' };
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);

  // Filter / search / page
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'potential' | 'skip'
  const [filterEntry, setFilterEntry] = useState('all');   // 'all' | 'entered' | 'not-entered'
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Sort: stored as an ordered array of mls_nums so edits never re-trigger a sort
  const [sortOrder, setSortOrder] = useState([]);   // mls_nums in current sort order
  const [sortCol, setSortCol] = useState('atroi');
  const [sortDir, setSortDir] = useState('desc');

  useEffect(() => {
    Promise.all([
      fetch('/api/scout/listings').then(r => r.json()),
      fetch('/api/scout/config').then(r => r.json()),
    ])
      .then(([listingsData, configData]) => {
        setListings(listingsData);
        setConfig(configData);
        setConfigDraft(configData);
        // Initialize sort order by default sort (atroi desc)
        const sorted = [...listingsData].sort((a, b) => {
          const ma = calcM(a, { rent_min: a.rent_min, rent_max: a.rent_max, rent_override: a.rent_override, repair_costs: a.repair_costs, hoa_quarterly: a.hoa_quarterly }, DEFAULTS);
          const mb = calcM(b, { rent_min: b.rent_min, rent_max: b.rent_max, rent_override: b.rent_override, repair_costs: b.repair_costs, hoa_quarterly: b.hoa_quarterly }, DEFAULTS);
          return (mb?.atroi ?? -999) - (ma?.atroi ?? -999);
        });
        setSortOrder(sorted.map(l => l.mls_num));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Merge DB data with local edits for a row
  const getMark = useCallback((listing) => {
    const local = localEdits[listing.mls_num];
    return {
      status: local?.status !== undefined ? local.status : listing.status,
      repair_costs: local?.repair_costs !== undefined ? local.repair_costs : listing.repair_costs,
      hoa_quarterly: local?.hoa_quarterly !== undefined ? local.hoa_quarterly : listing.hoa_quarterly,
      rent_override: local?.rent_override !== undefined ? local.rent_override : listing.rent_override,
      rent_min: listing.rent_min,
      rent_max: listing.rent_max,
      mark_notes: local?.mark_notes !== undefined ? local.mark_notes : listing.mark_notes,
    };
  }, [localEdits]);

  const patchMark = useCallback(async (mls_num, fields) => {
    // Optimistic local update
    setLocalEdits(e => ({ ...e, [mls_num]: { ...(e[mls_num] ?? {}), ...fields } }));
    try {
      const res = await fetch('/api/scout/marks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls_num, ...fields }),
      });
      if (!res.ok) throw new Error('Save failed');
      // Sync back to listings
      setListings(ls => ls.map(l => l.mls_num === mls_num ? { ...l, ...fields } : l));
    } catch (err) {
      console.error('Failed to save mark:', err);
    }
  }, []);

  // Update raw typing buffer only (no metrics recalc, no re-sort)
  const setTyping = (mls_num, field, value) => {
    setInputValues(v => ({ ...v, [mls_num]: { ...(v[mls_num] ?? {}), [field]: value } }));
  };

  // Commit a field: update metrics + save to DB + push to undo stack
  const commitField = useCallback(async (mls_num, field, rawValue, prevValue) => {
    const isNumeric = field !== 'mark_notes';
    const value = isNumeric
      ? (rawValue === '' || rawValue == null ? null : Number(rawValue))
      : (rawValue === '' ? null : rawValue);
    if (isNumeric && rawValue !== '' && rawValue != null && isNaN(Number(rawValue))) return;

    // Clear from typing buffer
    setInputValues(v => {
      const next = { ...v, [mls_num]: { ...(v[mls_num] ?? {}) } };
      delete next[mls_num][field];
      return next;
    });

    // Push undo entry if value actually changed
    if (value !== prevValue) {
      setUndoStack(s => [{ mls_num, field, prevValue, label: field.replace(/_/g, ' ') }, ...s.slice(0, 19)]);
    }

    await patchMark(mls_num, { [field]: value });
  }, [patchMark]);

  const undo = useCallback(async () => {
    const [last, ...rest] = undoStack;
    if (!last) return;
    setUndoStack(rest);
    await patchMark(last.mls_num, { [last.field]: last.prevValue });
  }, [undoStack, patchMark]);

  const setLocalField = (mls_num, field, value) => {
    setLocalEdits(e => ({ ...e, [mls_num]: { ...(e[mls_num] ?? {}), [field]: value } }));
  };

  // Compute metrics for all listings (memoized)
  const metricsMap = useMemo(() => {
    const m = {};
    listings.forEach(l => {
      const mark = getMark(l);
      m[l.mls_num] = calcM(l, mark, DEFAULTS);
    });
    return m;
  }, [listings, localEdits, getMark]);

  // Handle column header click: re-sort and update sortOrder
  const handleSort = useCallback((col) => {
    const newDir = sortCol === col && sortDir === 'desc' ? 'asc' : 'desc';
    setSortCol(col);
    setSortDir(newDir);
    // Re-sort using metricsMap (which is already computed from current listings + localEdits)
    setSortOrder(prev => {
      return [...listings].sort((a, b) => {
        const ma = metricsMap[a.mls_num];
        const mb = metricsMap[b.mls_num];
        let diff = 0;
        if (col === 'atroi') diff = (mb?.atroi ?? -999) - (ma?.atroi ?? -999);
        else if (col === 'cf')    diff = (mb?.cf ?? -999999) - (ma?.cf ?? -999999);
        else if (col === 'cap')   diff = (mb?.cap ?? -999) - (ma?.cap ?? -999);
        else if (col === 'coc')   diff = (mb?.coc ?? -999) - (ma?.coc ?? -999);
        else if (col === 'price') diff = Number(b.price) - Number(a.price);
        else if (col === 'beds')  diff = (b.beds ?? 0) - (a.beds ?? 0);
        else if (col === 'sqft')  diff = (b.sqft ?? 0) - (a.sqft ?? 0);
        return newDir === 'desc' ? diff : -diff;
      }).map(l => l.mls_num);
    });
  }, [sortCol, sortDir, listings, metricsMap]);

  // Stats
  const stats = useMemo(() => {
    const potential = listings.filter(l => getMark(l).status === 'potential').length;
    const skip = listings.filter(l => getMark(l).status === 'skip').length;
    const great = listings.filter(l => {
      const m = metricsMap[l.mls_num];
      return m && m.atroi >= 10;
    }).length;
    return { total: listings.length, potential, skip, great };
  }, [listings, localEdits, metricsMap, getMark]);

  const hasManualEntry = useCallback((listing) => {
    const local = localEdits[listing.mls_num] ?? {};
    const rentOvr   = local.rent_override   !== undefined ? local.rent_override   : listing.rent_override;
    const repairs   = local.repair_costs    !== undefined ? local.repair_costs    : listing.repair_costs;
    const hoa       = local.hoa_quarterly   !== undefined ? local.hoa_quarterly   : listing.hoa_quarterly;
    const notes     = local.mark_notes      !== undefined ? local.mark_notes      : listing.mark_notes;
    return rentOvr != null || repairs != null || hoa != null || (notes != null && notes !== '');
  }, [localEdits]);

  // Filter + sort + search
  // Sort order is stored as sortOrder (mls_num array) — only updated on header click, never on edit
  const filtered = useMemo(() => {
    // Build a lookup by mls_num so we can respect sortOrder
    const byMls = Object.fromEntries(listings.map(l => [l.mls_num, l]));

    // Listings that pass the filters, ordered by sortOrder
    const result = [];
    for (const mls of sortOrder) {
      const l = byMls[mls];
      if (!l) continue;
      const mark = getMark(l);
      if (filterStatus === 'potential' && mark.status !== 'potential') continue;
      if (filterStatus === 'skip' && mark.status !== 'skip') continue;
      if (filterEntry === 'entered'     && !hasManualEntry(l)) continue;
      if (filterEntry === 'not-entered' &&  hasManualEntry(l)) continue;
      if (priceMin !== '' && Number(l.price) < Number(priceMin)) continue;
      if (priceMax !== '' && Number(l.price) > Number(priceMax)) continue;
      if (search) {
        const q = search.toLowerCase();
        if (!l.address?.toLowerCase().includes(q) && !l.mls_num?.toLowerCase().includes(q)) continue;
      }
      result.push(l);
    }

    return result;
  }, [listings, filterStatus, filterEntry, sortOrder, priceMin, priceMax, search, localEdits, getMark, hasManualEntry]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when filter/sort/search changes
  useEffect(() => { setPage(1); }, [filterStatus, filterEntry, sortCol, priceMin, priceMax, search]);

  const saveConfig = async () => {
    try {
      const res = await fetch('/api/scout/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configDraft),
      });
      if (!res.ok) throw new Error('Save failed');
      setConfig(configDraft);
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2000);
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const saveManual = async () => {
    if (!addForm.address.trim()) return;
    setAddSaving(true);
    try {
      const body = {
        address: addForm.address.trim(),
        price:         addForm.price        !== '' ? Number(addForm.price)        : null,
        beds:          addForm.beds         !== '' ? Number(addForm.beds)         : null,
        baths:         addForm.baths        !== '' ? Number(addForm.baths)        : null,
        sqft:          addForm.sqft         !== '' ? Number(addForm.sqft)         : null,
        year_built:    addForm.year_built   !== '' ? Number(addForm.year_built)   : null,
        hoa_yn:        addForm.hoa_yn       !== '' ? addForm.hoa_yn === 'true'    : null,
        href:          addForm.href.trim()  || null,
        rent_override: addForm.rent_override !== '' ? Number(addForm.rent_override) : null,
        repair_costs:  addForm.repair_costs  !== '' ? Number(addForm.repair_costs)  : null,
        hoa_quarterly: addForm.hoa_quarterly !== '' ? Number(addForm.hoa_quarterly) : null,
        notes:         addForm.notes.trim() || null,
        source: 'manual',
      };
      const res = await fetch('/api/scout/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      const newListing = await res.json();
      setListings(ls => [newListing, ...ls]);
      setSortOrder(so => [newListing.mls_num, ...so]);
      setAddForm(EMPTY_FORM);
      setAddOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setAddSaving(false);
    }
  };

  const deleteListing = useCallback(async (mls_num) => {
    if (!confirm(`Delete ${mls_num}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/scout/listings/${mls_num}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setListings(ls => ls.filter(l => l.mls_num !== mls_num));
      setSortOrder(so => so.filter(m => m !== mls_num));
    } catch (err) {
      console.error(err);
    }
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-900 text-white p-6">
        <PageHeader title="Scout" subtitle="PAM Texas MLS listings" currentPage="/scout" />
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <PageHeader title="Scout" subtitle="PAM Texas MLS listings" currentPage="/scout" />
        </div>
        <div className="flex gap-2 mt-1 ml-4">
          <button
            onClick={() => setAddOpen(true)}
            className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-medium rounded-lg whitespace-nowrap"
          >
            + Add Property
          </button>
          <button
            onClick={() => router.push('/scout/compare')}
            className="px-4 py-2 bg-purple-700 hover:bg-purple-600 text-white text-sm font-medium rounded-lg whitespace-nowrap"
          >
            Compare Potentials →
          </button>
        </div>
      </div>

      {/* Add Property Modal */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <h2 className="text-white font-semibold">Add Property Manually</h2>
              <button onClick={() => setAddOpen(false)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="px-6 py-4 grid grid-cols-2 gap-3 overflow-y-auto max-h-[70vh]">
              {/* Address spans full width */}
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-gray-400">Address *</span>
                <input
                  type="text"
                  value={addForm.address}
                  onChange={e => setAddForm(f => ({ ...f, address: e.target.value }))}
                  placeholder="1234 Main St, Dallas, TX 75201"
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              {[
                { key: 'price',        label: 'List Price ($)',    type: 'number' },
                { key: 'rent_override',label: 'Monthly Rent ($)',  type: 'number' },
                { key: 'beds',         label: 'Beds',              type: 'number' },
                { key: 'baths',        label: 'Baths',             type: 'number' },
                { key: 'sqft',         label: 'Sqft',              type: 'number' },
                { key: 'year_built',   label: 'Year Built',        type: 'number' },
                { key: 'repair_costs', label: 'Est. Repair Costs ($)', type: 'number' },
                { key: 'hoa_quarterly',label: 'HOA ($/qtr)',       type: 'number' },
              ].map(({ key, label, type }) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">{label}</span>
                  <input
                    type={type}
                    value={addForm[key]}
                    onChange={e => setAddForm(f => ({ ...f, [key]: e.target.value }))}
                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">HOA?</span>
                <select
                  value={addForm.hoa_yn}
                  onChange={e => setAddForm(f => ({ ...f, hoa_yn: e.target.value }))}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Unknown</option>
                  <option value="false">No HOA</option>
                  <option value="true">Yes, has HOA</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Listing URL (optional)</span>
                <input
                  type="url"
                  value={addForm.href}
                  onChange={e => setAddForm(f => ({ ...f, href: e.target.value }))}
                  placeholder="https://…"
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                />
              </label>
              <label className="col-span-2 flex flex-col gap-1">
                <span className="text-xs text-gray-400">Notes</span>
                <textarea
                  rows={2}
                  value={addForm.notes}
                  onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                  className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setAddOpen(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button
                onClick={saveManual}
                disabled={!addForm.address.trim() || addSaving}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
              >
                {addSaving ? 'Saving…' : 'Add to Scout List'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Config Panel */}
      <div className="bg-gray-800 rounded-xl mb-4">
        <button
          onClick={() => setConfigOpen(o => !o)}
          className="w-full flex items-center justify-between px-5 py-3 text-sm font-medium text-gray-300 hover:text-white"
        >
          <span>Scraper Config</span>
          <span className="text-gray-500">{configOpen ? '▲' : '▼'}</span>
        </button>
        {configOpen && (
          <div className="px-5 pb-5 border-t border-gray-700 pt-4">
            <div className="flex flex-wrap gap-4 items-end">
              {[
                { key: 'min_price', label: 'Min Price' },
                { key: 'max_price', label: 'Max Price' },
                { key: 'min_beds', label: 'Min Beds' },
                { key: 'max_pages', label: 'Max Pages' },
              ].map(({ key, label }) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-xs text-gray-400">{label}</span>
                  <input
                    type="number"
                    value={configDraft[key] ?? ''}
                    onChange={e => setConfigDraft(d => ({ ...d, [key]: e.target.value }))}
                    className="w-28 bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </label>
              ))}
              <button
                onClick={saveConfig}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded"
              >
                {configSaved ? 'Saved!' : 'Save Config'}
              </button>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              After saving, the GitHub Actions workflow will pick up new settings on the next morning run.
              Or run <code className="bg-gray-700 px-1 rounded">npm run scout</code> locally to fetch now.
            </p>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Total: <span className="font-bold text-white">{stats.total}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Potential: <span className="font-bold text-green-400">{stats.potential}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Skip: <span className="font-bold text-red-400">{stats.skip}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Great ATROI (≥10%): <span className="font-bold text-purple-400">{stats.great}</span>
        </span>
        {undoStack.length > 0 && (
          <button
            onClick={undo}
            className="ml-auto px-3 py-1.5 bg-yellow-700/60 hover:bg-yellow-600/60 text-yellow-200 text-xs rounded-lg font-medium"
            title={`Undo: ${undoStack[0]?.label} on ${undoStack[0]?.mls_num}`}
          >
            ↩ Undo ({undoStack.length})
          </button>
        )}
      </div>

      {/* Filter / Sort Bar */}
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {[
            { key: 'all', label: 'All' },
            { key: 'potential', label: 'Potential' },
            { key: 'skip', label: 'Skip' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                filterStatus === key
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {[
            { key: 'all',         label: 'All' },
            { key: 'entered',     label: '✏ Entered' },
            { key: 'not-entered', label: '○ Blank' },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilterEntry(key)}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                filterEntry === key
                  ? 'bg-amber-600 text-white'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1">
          <span className="text-xs text-gray-500">$</span>
          <input
            type="number"
            value={priceMin}
            onChange={e => setPriceMin(e.target.value)}
            placeholder="Min price"
            className="w-24 bg-transparent text-sm text-gray-300 focus:outline-none"
          />
          <span className="text-xs text-gray-500">–</span>
          <input
            type="number"
            value={priceMax}
            onChange={e => setPriceMax(e.target.value)}
            placeholder="Max price"
            className="w-24 bg-transparent text-sm text-gray-300 focus:outline-none"
          />
        </div>

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search address or MLS#…"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500 w-56"
        />
      </div>

      {/* Table */}
      {listings.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No listings yet.</p>
          <p className="text-gray-600 text-sm">
            The GitHub Actions workflow will fetch properties automatically each morning,
            or run <code className="bg-gray-700 px-1.5 py-0.5 rounded">npm run scout</code> locally to fetch now.
          </p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700 text-xs">
                {[
                  { col: null,    label: 'Address' },
                  { col: 'price', label: 'Price' },
                  { col: 'beds',  label: 'Bd/Ba' },
                  { col: 'sqft',  label: 'Sqft' },
                  { col: null,    label: 'Repairs $' },
                  { col: null,    label: 'HOA $/qtr' },
                  { col: null,    label: 'Est. Rent' },
                  { col: 'cf',    label: 'Cash Flow' },
                  { col: 'cap',   label: 'Cap' },
                  { col: 'coc',   label: 'CoC' },
                  { col: 'atroi', label: '30y ATROI' },
                  { col: null,    label: 'Notes' },
                  { col: null,    label: 'Mark' },
                ].map(({ col, label }) => (
                  <th
                    key={label}
                    className={`px-3 py-3 font-medium select-none ${col ? 'cursor-pointer hover:text-white' : ''}`}
                    onClick={col ? () => handleSort(col) : undefined}
                    title={col ? `Sort by ${label}` : undefined}
                  >
                    {label}
                    {col && sortCol === col && (
                      <span className="ml-1 text-blue-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
                    )}
                    {col && sortCol !== col && (
                      <span className="ml-1 text-gray-600">↕</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {paginated.map(listing => {
                const mark = getMark(listing);
                const metrics = metricsMap[listing.mls_num];
                const local = localEdits[listing.mls_num] ?? {};

                // Committed values (used for metrics/sorting)
                const repairVal = local.repair_costs !== undefined ? local.repair_costs : (listing.repair_costs ?? '');
                const hoaVal = local.hoa_quarterly !== undefined ? local.hoa_quarterly : (listing.hoa_quarterly ?? '');
                const rentVal = local.rent_override !== undefined ? local.rent_override : (listing.rent_override ?? '');
                const notesVal = local.mark_notes !== undefined ? local.mark_notes : (listing.mark_notes ?? '');

                // Raw typing buffer values (shown while user is typing — don't affect metrics)
                const inp = inputValues[listing.mls_num] ?? {};
                const repairInput = inp.repair_costs !== undefined ? inp.repair_costs : (repairVal !== '' ? String(repairVal) : '');
                const hoaInput    = inp.hoa_quarterly !== undefined ? inp.hoa_quarterly : (hoaVal !== '' ? String(hoaVal) : '');
                const rentInput   = inp.rent_override !== undefined ? inp.rent_override : (rentVal !== '' ? String(rentVal) : '');
                const notesInput  = inp.mark_notes !== undefined ? inp.mark_notes : (notesVal != null ? String(notesVal) : '');

                const priceDiff = listing.first_price && listing.first_price !== listing.price
                  ? Number(listing.price) - Number(listing.first_price)
                  : null;

                const firstSeenDate = listing.first_seen
                  ? new Date(listing.first_seen).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
                  : null;

                const isRelisted = listing.reappeared_count > 0 && listing.last_absence_days >= 2;
                const absenceDays = listing.last_absence_days;
                const absenceLabel = absenceDays == null ? null
                  : absenceDays >= 60 ? `${Math.round(absenceDays / 30)}mo`
                  : absenceDays >= 14 ? `${Math.round(absenceDays / 7)}wk`
                  : `${absenceDays}d`;

                const touched = hasManualEntry(listing);

                // HOA confirmed at $0 — compute the tooltip date
                const hoaIsZero = hoaVal === 0 || hoaVal === '0';
                const hoaSetAt = listing.hoa_set_at
                  ? new Date(listing.hoa_set_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit', hour: 'numeric', minute: '2-digit' })
                  : null;

                return (
                  <tr key={listing.mls_num} className={`hover:bg-gray-750 align-top ${touched ? 'border-l-2 border-amber-500/70' : ''}`}>
                    {/* Address */}
                    <td className="px-3 py-2 max-w-[200px]">
                      <div className="font-medium text-white text-xs leading-tight">
                        {listing.href ? (
                          <a href={listing.href} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors">
                            {listing.address}
                          </a>
                        ) : (
                          listing.address
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-gray-600 text-xs">{listing.mls_num}</span>
                        <button
                          onClick={() => copyToClipboard(listing.mls_num)}
                          className="text-gray-600 hover:text-gray-400 text-xs"
                          title="Copy MLS#"
                        >
                          📋
                        </button>
                        {listing.address && (
                          <a
                            href={`https://www.zillow.com/homes/for_rent/${encodeURIComponent(listing.address)}_rb/`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:text-blue-300 text-xs font-bold"
                            title="Search nearby rentals on Zillow"
                          >
                            Z$
                          </a>
                        )}
                      </div>
                      {isRelisted && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 bg-orange-500/20 border border-orange-500/50 text-orange-300 text-xs font-bold px-1.5 py-0.5 rounded">
                            ↩ RELISTED{absenceLabel ? ` (gone ${absenceLabel})` : ''}
                          </span>
                        </div>
                      )}
                      {firstSeenDate && (
                        <div className="text-gray-600 text-xs mt-0.5">First seen: {firstSeenDate}</div>
                      )}
                      {listing.source && listing.source !== 'pam' && (
                        <div className="mt-0.5">
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            listing.source === 'reination' ? 'bg-indigo-900/50 text-indigo-300' :
                            listing.source === 'manual'    ? 'bg-gray-700 text-gray-400' : 'bg-gray-700 text-gray-500'
                          }`}>
                            {listing.source === 'reination' ? 'Reination' : listing.source === 'manual' ? 'Manual' : listing.source}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* Price */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="font-mono text-white text-xs">{fmt$(listing.price)}</div>
                      {priceDiff !== null && (
                        <div className={`text-xs font-medium ${priceDiff < 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {priceDiff < 0 ? '↓' : '↑'}{fmt$(Math.abs(priceDiff))}
                        </div>
                      )}
                    </td>

                    {/* Beds/Baths */}
                    <td className="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">
                      {listing.beds ?? '—'}/{listing.baths ?? '—'}
                    </td>

                    {/* Sqft */}
                    <td className="px-3 py-2 text-gray-300 text-xs whitespace-nowrap">
                      {listing.sqft ? listing.sqft.toLocaleString() : '—'}
                    </td>

                    {/* Repairs */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={repairInput}
                        onChange={e => setTyping(listing.mls_num, 'repair_costs', e.target.value)}
                        onBlur={() => commitField(listing.mls_num, 'repair_costs', repairInput, repairVal)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                        placeholder={String(DEFAULTS.repairCosts)}
                        className="w-20 bg-gray-700 border border-amber-800/60 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-amber-500"
                        title="Type value then press Enter to save"
                      />
                    </td>

                    {/* HOA */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={hoaInput}
                        onChange={e => setTyping(listing.mls_num, 'hoa_quarterly', e.target.value)}
                        onBlur={() => commitField(listing.mls_num, 'hoa_quarterly', hoaInput, hoaVal)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                        placeholder="0"
                        className={`w-20 bg-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none ${
                          hoaIsZero
                            ? 'border border-green-600 focus:border-green-400'
                            : 'border border-cyan-800/60 focus:border-cyan-500'
                        }`}
                        title={hoaSetAt ? `Entered on ${hoaSetAt}` : 'Type value then press Enter to save'}
                      />
                      {hoaIsZero && (
                        <div
                          className="mt-0.5 inline-flex items-center gap-0.5 bg-green-900/50 border border-green-700/60 text-green-300 text-xs font-bold px-1.5 py-0.5 rounded cursor-default"
                          title={hoaSetAt ? `Confirmed $0 HOA on ${hoaSetAt}` : 'Confirmed $0 HOA'}
                        >
                          ✓ No HOA
                        </div>
                      )}
                    </td>

                    {/* Est. Rent */}
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        value={rentInput}
                        onChange={e => setTyping(listing.mls_num, 'rent_override', e.target.value)}
                        onBlur={() => commitField(listing.mls_num, 'rent_override', rentInput, rentVal)}
                        onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                        placeholder={listing.sqft ? String(Math.round(listing.sqft * DEFAULTS.rentPerSqft)) : ''}
                        className="w-20 bg-gray-700 border border-blue-800/60 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
                        title="Type value then press Enter to save"
                      />
                      {listing.rent_min != null && listing.rent_max != null && (
                        <div className="text-gray-600 text-xs mt-0.5">
                          {fmt$(listing.rent_min)}–{fmt$(listing.rent_max)}
                        </div>
                      )}
                    </td>

                    {/* Cash Flow */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {metrics ? (
                        <span className={`text-xs font-bold ${metrics.cf >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {metrics.cf >= 0 ? '+' : ''}{fmt$(metrics.cf)}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-xs">—</span>
                      )}
                    </td>

                    {/* Cap Rate */}
                    <td className="px-3 py-2 whitespace-nowrap text-gray-300 text-xs">
                      {metrics ? fmtPct(metrics.cap) : '—'}
                    </td>

                    {/* CoC */}
                    <td className="px-3 py-2 whitespace-nowrap text-gray-300 text-xs">
                      {metrics ? fmtPct(metrics.coc) : '—'}
                    </td>

                    {/* ATROI */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <AtroiBadge value={metrics?.atroi ?? null} />
                    </td>

                    {/* Notes */}
                    <td className="px-3 py-2">
                      <textarea
                        rows={2}
                        value={notesInput}
                        onChange={e => setTyping(listing.mls_num, 'mark_notes', e.target.value)}
                        onBlur={() => commitField(listing.mls_num, 'mark_notes', notesInput, notesVal)}
                        placeholder="Notes…"
                        className="w-32 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500 resize-none"
                        title="Click away or Tab to save"
                      />
                    </td>

                    {/* Mark */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => patchMark(listing.mls_num, { status: mark.status === 'potential' ? null : 'potential' })}
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                            mark.status === 'potential'
                              ? 'bg-green-700 text-green-100'
                              : 'bg-gray-700 text-gray-400 hover:bg-green-900/50 hover:text-green-300'
                          }`}
                        >
                          ✓ Potential
                        </button>
                        <button
                          onClick={() => patchMark(listing.mls_num, { status: mark.status === 'skip' ? null : 'skip' })}
                          className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                            mark.status === 'skip'
                              ? 'bg-red-800 text-red-100'
                              : 'bg-gray-700 text-gray-400 hover:bg-red-900/50 hover:text-red-300'
                          }`}
                        >
                          ✗ Skip
                        </button>
                        {listing.source === 'manual' && (
                          <button
                            onClick={() => deleteListing(listing.mls_num)}
                            className="px-2 py-1 text-xs rounded font-medium bg-gray-700 text-gray-500 hover:bg-red-900/60 hover:text-red-400 transition-colors"
                            title="Delete this manually-added listing"
                          >
                            🗑 Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
          <span>
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
