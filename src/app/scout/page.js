'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import { calcM, calcGroup, DEFAULTS } from '@/lib/calcMetrics';

function fmt$(n) {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString();
}
function fmtPct(n) {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}

function extractState(address) {
  if (!address) return '';
  // Handles: "City, TX 75201"  "City, TX, 75201"  "City, TX"
  const m = address.match(/,\s*([A-Z]{2})(?:\s+\d{5}|,\s*\d{5})?\s*$/);
  return m ? m[1] : '';
}

function addrKey(address) {
  if (!address) return null;
  const norm = address.toLowerCase()
    .replace(/\bdrive\b/g, 'dr').replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd').replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct').replace(/\bcircle\b/g, 'cir').replace(/\bplace\b/g, 'pl')
    .replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim();
  const tokens = norm.split(' ');
  if (tokens.length < 2 || !/^\d+/.test(tokens[0])) return null;
  return tokens[0] + ' ' + tokens[1]; // e.g. "1712 haven"
}

const MERGE_FIELDS = [
  { key: 'address',       label: 'Address',    src: 'listing' },
  { key: 'price',         label: 'Price',      src: 'listing' },
  { key: 'beds',          label: 'Beds',       src: 'listing' },
  { key: 'baths',         label: 'Baths',      src: 'listing' },
  { key: 'sqft',          label: 'Sqft',       src: 'listing' },
  { key: 'year_built',    label: 'Year Built', src: 'listing' },
  { key: 'href',          label: 'Link',       src: 'listing' },
  { key: 'repair_costs',  label: 'Repairs $',  src: 'mark'    },
  { key: 'hoa_quarterly', label: 'HOA $/qtr',  src: 'mark'    },
  { key: 'rent_override', label: 'Rent',       src: 'mark'    },
  { key: 'status',        label: 'Status',     src: 'mark'    },
  { key: 'mark_notes',    label: 'Notes',      src: 'mark'    },
];

function sourceLabel(source) {
  if (source === 'reination') return 'REI Nation';
  if (source === 'pam') return 'PAMS';
  if (source === 'manual') return 'Manual';
  return source ?? '—';
}

function Roi5Badge({ value }) {
  if (value == null) return <span className="text-gray-500">—</span>;
  const color = value >= 15 ? 'bg-purple-900/60 text-purple-300' : value >= 10 ? 'bg-yellow-900/60 text-yellow-300' : 'bg-red-900/60 text-red-300';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`} title="5yr equity ROI: appreciation (3%/yr) + principal paydown + cash flows, annualized">{value.toFixed(1)}%</span>;
}

function AtroiBadge({ value, err }) {
  if (err) return <span className="text-xs font-bold px-2 py-0.5 rounded bg-orange-900/60 text-orange-300" title="Data error — delete and re-add this listing">err</span>;
  if (value == null) return <span className="text-gray-500">—</span>;
  const color = value >= 10 ? 'bg-purple-900/60 text-purple-300' : value >= 5 ? 'bg-yellow-900/60 text-yellow-300' : 'bg-red-900/60 text-red-300';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded ${color}`}>{value.toFixed(1)}%</span>;
}

const PAGE_SIZE = 50;

export default function ScoutPage() {
  const router = useRouter();
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({ total: 0, potential: 0, skip: 0, great: 0, pending: 0 });
  const [pendingListings, setPendingListings] = useState([]);
  const [config, setConfig] = useState(null);
  const [configDraft, setConfigDraft] = useState({});
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingAddress, setEditingAddress] = useState(null); // mls_num being edited

  // Local edits per mls_num (committed values — used for metrics/sorting)
  const [localEdits, setLocalEdits] = useState({});

  // Raw typing buffer — updated on every keystroke but NOT used for metrics/sorting
  // This prevents re-sorting mid-type which was causing the 1-digit bug
  const [inputValues, setInputValues] = useState({});

  // Undo stack: [{mls_num, field, prevValue, label}]
  const [undoStack, setUndoStack] = useState([]);

  // Merge modal
  const [mergePair, setMergePair] = useState(null); // { manual, scraped }
  const [mergeChoices, setMergeChoices] = useState({}); // { keep:'scraped'|'manual', [field]:'manual'|'scraped' }
  const [mergeSaving, setMergeSaving] = useState(false);

  // Manual-add modal
  const [addOpen, setAddOpen] = useState(false);
  const EMPTY_FORM = { address: '', price: '', beds: '', baths: '', sqft: '', year_built: '', hoa_yn: '', href: '', rent_override: '', repair_costs: '', hoa_quarterly: '', notes: '' };
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [taxFetching, setTaxFetching] = useState({}); // mls_num → true while fetching
  const [taxBulkRunning, setTaxBulkRunning] = useState(false);
  const [taxBulkProgress, setTaxBulkProgress] = useState(null); // "12/100"
  const [editingTax, setEditingTax] = useState(null);     // mls_num editing annual amount
  const [editingTaxAcct, setEditingTaxAcct] = useState(null); // mls_num editing account number

  // Top-level tab
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'pending'

  // Filter / search / page
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'potential' | 'skip'
  const [filterEntry, setFilterEntry] = useState('all');   // 'all' | 'entered' | 'not-entered'
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [rentPctMin, setRentPctMin] = useState('');
  const [cfMin, setCfMin] = useState('');
  const [capMin, setCapMin] = useState('');
  const [bedsMin, setBedsMin] = useState('');
  // Draft values — updated on every keystroke, committed to filter state on Enter/blur
  const [filterDrafts, setFilterDrafts] = useState({ rentPctMin: '', cfMin: '', capMin: '', bedsMin: '' });
  const setDraft = (key, val) => setFilterDrafts(d => ({ ...d, [key]: val }));
  const commitDraft = (key, setter) => setter(filterDrafts[key]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [sortCol, setSortCol] = useState('atroi');
  const [sortDir, setSortDir] = useState('desc');

  const [debouncedSearch, setDebouncedSearch] = useState('');
  const commitSearch = useCallback(() => setDebouncedSearch(search), [search]);

  // Fetch listings from server whenever sort/filter/search params change
  // Both tabs are fetched in parallel so switching tabs is instant (no re-fetch)
  useEffect(() => {
    setLoading(true);
    const baseParams = { sort: sortCol, dir: sortDir, search: debouncedSearch, priceMin, priceMax, rentPctMin, cfMin, capMin, bedsMin };
    const activeParams = new URLSearchParams({ ...baseParams, tab: 'active' });
    const pendingParams = new URLSearchParams({ ...baseParams, tab: 'pending', limit: '200' });
    Promise.all([
      fetch(`/api/scout/listings?${activeParams}`).then(r => r.json()),
      fetch(`/api/scout/listings?${pendingParams}`).then(r => r.json()),
      fetch('/api/scout/config').then(r => r.json()),
    ])
      .then(([activeData, pendingData, configData]) => {
        setListings(activeData.listings ?? []);
        setPendingListings(pendingData.listings ?? []);
        setStats({ ...(activeData.stats ?? { total: 0, potential: 0, skip: 0, great: 0 }), pending: pendingData.listings?.length ?? 0 });
        setConfig(configData);
        setConfigDraft(configData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sortCol, sortDir, debouncedSearch, priceMin, priceMax, rentPctMin, cfMin, capMin, bedsMin]);

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

  // Compute metrics for rendered rows — use server pre-computed values unless there are local edits
  const metricsMap = useMemo(() => {
    const m = {};
    [...listings, ...pendingListings].forEach(l => {
      const hasEdits = localEdits[l.mls_num] || l.tax_annual != null;
      if (hasEdits) {
        const mark = getMark(l);
        m[l.mls_num] = { ...calcM(l, mark, DEFAULTS), group: calcGroup(l, mark, DEFAULTS) };
      } else {
        m[l.mls_num] = l.cf != null
          ? { cf: l.cf, cap: l.cap, coc: l.coc, atroi: l.atroi, atroiErr: l.atroiErr, roi5: l.roi5, rent: l.rent, rentPct: l.rentPct, group: l.group }
          : null;
      }
    });
    return m;
  }, [listings, pendingListings, localEdits, getMark]);

  // Handle column header click: update sort state → triggers re-fetch
  const handleSort = useCallback((col) => {
    const newDir = sortCol === col && sortDir === 'desc' ? 'asc' : 'desc';
    setSortCol(col);
    setSortDir(newDir);
  }, [sortCol, sortDir]);

  const hasManualEntry = useCallback((listing) => {
    const local = localEdits[listing.mls_num] ?? {};
    const rentOvr   = local.rent_override   !== undefined ? local.rent_override   : listing.rent_override;
    const repairs   = local.repair_costs    !== undefined ? local.repair_costs    : listing.repair_costs;
    const hoa       = local.hoa_quarterly   !== undefined ? local.hoa_quarterly   : listing.hoa_quarterly;
    const notes     = local.mark_notes      !== undefined ? local.mark_notes      : listing.mark_notes;
    return rentOvr != null || repairs != null || hoa != null || (notes != null && notes !== '');
  }, [localEdits]);

  // Filter client-side (listings already pre-sorted from server; search/price handled server-side)
  const filtered = useMemo(() => {
    return listings.filter(l => {
      const mark = getMark(l);
      if (filterStatus === 'potential' && mark.status !== 'potential') return false;
      if (filterStatus === 'skip' && mark.status !== 'skip') return false;
      if (filterEntry === 'entered'     && !hasManualEntry(l)) return false;
      if (filterEntry === 'not-entered' &&  hasManualEntry(l)) return false;
      return true;
    });
  }, [listings, filterStatus, filterEntry, localEdits, getMark, hasManualEntry]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset to page 1 when filter/sort/search changes
  useEffect(() => { setPage(1); }, [filterStatus, filterEntry, sortCol, priceMin, priceMax, rentPctMin, cfMin, capMin, bedsMin, debouncedSearch]);

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
      // Prepend to local list (server will re-sort on next fetch)
      setListings(ls => [newListing, ...ls]);
      setAddForm(EMPTY_FORM);
      setAddOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setAddSaving(false);
    }
  };

  const patchListing = useCallback(async (mls_num, fields) => {
    // Optimistic update so metrics recalculate immediately
    setListings(ls => ls.map(l => l.mls_num === mls_num ? { ...l, ...fields } : l));
    try {
      const res = await fetch(`/api/scout/listings/${mls_num}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (err) {
      console.error('Failed to save listing:', err);
    }
  }, []);

  const deleteListing = useCallback(async (mls_num) => {
    if (!confirm(`Delete ${mls_num}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/scout/listings/${mls_num}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setListings(ls => ls.filter(l => l.mls_num !== mls_num));
    } catch (err) {
      console.error(err);
    }
  }, []);

  const fetchTax = useCallback(async (mls_num) => {
    setTaxFetching(f => ({ ...f, [mls_num]: true }));
    try {
      const res = await fetch('/api/scout/tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls_num }),
      });
      const data = await res.json();
      if (data.ok) {
        setListings(ls => ls.map(l => l.mls_num === mls_num
          ? { ...l, tax_annual: data.tax_annual, tax_account_num: data.tax_account_num }
          : l
        ));
      } else if (data.error === 'cloudflare') {
        alert('Cloudflare blocked the request. Run: node scout/tax-scraper.js locally');
      } else {
        console.warn('Tax lookup failed:', data.error);
      }
    } catch (e) {
      console.error('Tax fetch error:', e);
    } finally {
      setTaxFetching(f => { const n = { ...f }; delete n[mls_num]; return n; });
    }
  }, []);

  const fetchTaxBulk = useCallback(async () => {
    setTaxBulkRunning(true);
    try {
      const res = await fetch('/api/scout/tax?limit=100');
      const queue = await res.json(); // [{ mls_num, address }, ...]
      for (let i = 0; i < queue.length; i++) {
        setTaxBulkProgress(`${i + 1}/${queue.length}`);
        await fetchTax(queue[i].mls_num);
        await new Promise(r => setTimeout(r, 1500)); // polite delay
      }
    } finally {
      setTaxBulkRunning(false);
      setTaxBulkProgress(null);
    }
  }, [fetchTax]);

  // Detect potential duplicates: manual entry vs scraped entry with same street number + name
  const duplicatePairs = useMemo(() => {
    const manuals = listings.filter(l => l.source === 'manual');
    const scraped = listings.filter(l => l.source !== 'manual');
    const pairs = [];
    for (const m of manuals) {
      const mk = addrKey(m.address);
      if (!mk) continue;
      for (const s of scraped) {
        if (addrKey(s.address) === mk) pairs.push({ manual: m, scraped: s });
      }
    }
    return pairs;
  }, [listings]);

  // Set of mls_nums that have a potential duplicate
  const duplicateSet = useMemo(() => new Set(duplicatePairs.flatMap(p => [p.manual.mls_num, p.scraped.mls_num])), [duplicatePairs]);

  const openMerge = useCallback((pair) => {
    const { manual, scraped } = pair;
    const choices = { keep: 'scraped' };
    MERGE_FIELDS.forEach(({ key, src }) => {
      const mv = manual[key]; const sv = scraped[key];
      if (mv == null && sv != null) choices[key] = 'scraped';
      else if (sv == null && mv != null) choices[key] = 'manual';
      else choices[key] = src === 'listing' ? 'scraped' : 'manual';
    });
    setMergeChoices(choices);
    setMergePair(pair);
  }, []);

  const handleMerge = useCallback(async () => {
    if (!mergePair) return;
    setMergeSaving(true);
    const { manual, scraped } = mergePair;
    const keepMls = mergeChoices.keep === 'scraped' ? scraped.mls_num : manual.mls_num;
    const dropMls = mergeChoices.keep === 'scraped' ? manual.mls_num : scraped.mls_num;
    const pick = (key) => {
      const src = mergeChoices[key] ?? 'scraped';
      return src === 'manual' ? manual[key] : scraped[key];
    };
    const listing_fields = { address: pick('address'), price: pick('price'), beds: pick('beds'), baths: pick('baths'), sqft: pick('sqft'), year_built: pick('year_built'), href: pick('href') };
    const mark_fields = { repair_costs: pick('repair_costs'), hoa_quarterly: pick('hoa_quarterly'), rent_override: pick('rent_override'), status: pick('status'), mark_notes: pick('mark_notes') };
    try {
      const res = await fetch('/api/scout/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_mls: keepMls, drop_mls: dropMls, listing_fields, mark_fields }),
      });
      if (!res.ok) throw new Error('Merge failed');
      // Update local state: remove dropped listing, update kept listing
      setListings(ls => ls.filter(l => l.mls_num !== dropMls).map(l =>
        l.mls_num === keepMls ? { ...l, ...listing_fields, ...mark_fields } : l
      ));
      setMergePair(null);
    } catch (err) {
      console.error(err);
      alert('Merge failed: ' + err.message);
    } finally {
      setMergeSaving(false);
    }
  }, [mergePair, mergeChoices]);

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

      {/* Merge Modal */}
      {mergePair && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-white font-semibold">Potential Duplicate Detected</h2>
                <p className="text-gray-400 text-xs mt-0.5">Choose which values to keep, then merge into one record.</p>
              </div>
              <button onClick={() => setMergePair(null)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              {/* Keep which record */}
              <div className="flex items-center gap-6 mb-4 p-3 bg-gray-700/50 rounded-lg">
                <span className="text-xs text-gray-400 font-medium">Keep record:</span>
                {[
                  { val: 'scraped', label: `${sourceLabel(mergePair.scraped.source)} (${mergePair.scraped.mls_num})` },
                  { val: 'manual',  label: `Manual (${mergePair.manual.mls_num})` },
                ].map(({ val, label }) => (
                  <label key={val} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-200">
                    <input type="radio" name="keep" value={val} checked={mergeChoices.keep === val}
                      onChange={() => setMergeChoices(c => ({ ...c, keep: val }))} className="accent-blue-500" />
                    {label}
                  </label>
                ))}
              </div>
              {/* Field-by-field table */}
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left py-1.5 w-24">Field</th>
                    <th className="text-left py-1.5">Manual entry</th>
                    <th className="text-left py-1.5">{sourceLabel(mergePair.scraped.source)}</th>
                  </tr>
                </thead>
                <tbody>
                  {MERGE_FIELDS.filter(({ key }) => mergePair.manual[key] != null || mergePair.scraped[key] != null).map(({ key, label }) => {
                    const mv = mergePair.manual[key];
                    const sv = mergePair.scraped[key];
                    const same = String(mv ?? '') === String(sv ?? '');
                    const display = v => v == null ? <span className="text-gray-600">—</span> : key === 'href' ? <span className="truncate max-w-[200px] inline-block">{String(v).slice(0, 40)}…</span> : String(v);
                    return (
                      <tr key={key} className="border-b border-gray-700/50">
                        <td className="py-1.5 text-gray-400 font-medium">{label}</td>
                        <td className="py-1.5 pr-4">
                          {same ? (
                            <span className="text-gray-300">{display(mv)}</span>
                          ) : (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name={`f_${key}`} checked={mergeChoices[key] === 'manual'}
                                onChange={() => setMergeChoices(c => ({ ...c, [key]: 'manual' }))} className="accent-blue-500" />
                              <span className={mergeChoices[key] === 'manual' ? 'text-white' : 'text-gray-400'}>{display(mv)}</span>
                            </label>
                          )}
                        </td>
                        <td className="py-1.5">
                          {same ? (
                            <span className="text-gray-500 text-xs italic">(same)</span>
                          ) : (
                            <label className="flex items-center gap-1.5 cursor-pointer">
                              <input type="radio" name={`f_${key}`} checked={mergeChoices[key] === 'scraped'}
                                onChange={() => setMergeChoices(c => ({ ...c, [key]: 'scraped' }))} className="accent-blue-500" />
                              <span className={mergeChoices[key] === 'scraped' ? 'text-white' : 'text-gray-400'}>{display(sv)}</span>
                            </label>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
              <button onClick={() => setMergePair(null)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button
                onClick={handleMerge}
                disabled={mergeSaving}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-medium"
              >
                {mergeSaving ? 'Merging…' : 'Merge Records →'}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Active / Pending Tab */}
      <div className="flex gap-1 bg-gray-800 rounded-lg p-1 mb-4 w-fit">
        <button
          onClick={() => { setActiveTab('active'); setPage(1); }}
          className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${activeTab === 'active' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Active {stats.total > 0 && <span className="ml-1 text-xs opacity-80">({stats.total})</span>}
        </button>
        <button
          onClick={() => { setActiveTab('pending'); setPage(1); }}
          className={`px-4 py-1.5 text-sm rounded font-medium transition-colors ${activeTab === 'pending' ? 'bg-yellow-600 text-white' : 'text-gray-400 hover:text-white'}`}
        >
          Pending {stats.pending > 0 && <span className="ml-1 text-xs opacity-80">({stats.pending})</span>}
        </button>
      </div>

      {/* Stats Bar */}
      <div className="flex flex-wrap gap-3 mb-4 text-sm">
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Total: <span className="font-bold text-white">{stats.total}</span>
        </span>
        {activeTab === 'active' && <>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Potential: <span className="font-bold text-green-400">{stats.potential}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Skip: <span className="font-bold text-red-400">{stats.skip}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Great ATROI (≥10%): <span className="font-bold text-purple-400">{stats.great}</span>
        </span>
        </>}
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

      {/* Filter / Sort Bar — Active tab only */}
      {activeTab === 'active' && <div className="flex flex-wrap gap-3 items-center mb-4">
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

        {/* Metric filters — commit on Enter or blur */}
        {[
          { label: 'Rent% ≥', key: 'rentPctMin', setter: setRentPctMin, placeholder: '1.1', width: 'w-12' },
          { label: 'CF ≥ $',  key: 'cfMin',      setter: setCfMin,      placeholder: '0',   width: 'w-14' },
          { label: 'Cap ≥',   key: 'capMin',     setter: setCapMin,     placeholder: '5',   width: 'w-10' },
          { label: 'Beds ≥',  key: 'bedsMin',    setter: setBedsMin,    placeholder: '2',   width: 'w-10' },
        ].map(({ label, key, setter, placeholder, width }) => (
          <div key={key} className="flex items-center gap-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1">
            <span className="text-xs text-gray-500 whitespace-nowrap">{label}</span>
            <input
              type="number"
              value={filterDrafts[key]}
              onChange={e => setDraft(key, e.target.value)}
              onBlur={() => commitDraft(key, setter)}
              onKeyDown={e => e.key === 'Enter' && commitDraft(key, setter)}
              placeholder={placeholder}
              className={`${width} bg-transparent text-sm text-gray-300 focus:outline-none`}
            />
          </div>
        ))}

        <div className="flex items-center gap-1">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commitSearch()}
            placeholder="Search address or MLS#…"
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-300 focus:outline-none focus:border-blue-500 w-56"
          />
          <button
            onClick={commitSearch}
            className="bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs px-3 py-1.5 rounded-lg border border-gray-600"
          >Search</button>
        </div>

        <span className="text-xs text-gray-500" title="Run locally: npm run scout:tax">
          Tax data: <code className="bg-gray-800 px-1 rounded">npm run scout:tax</code>
        </span>
      </div>}

      {/* Pending Table */}
      {activeTab === 'pending' && (
        pendingListings.length === 0 ? (
          <div className="bg-gray-800 rounded-xl p-12 text-center">
            <p className="text-gray-400 text-lg mb-2">No pending listings yet.</p>
            <p className="text-gray-600 text-sm">Properties will appear here when they go Pending in MLS after the next scrape.</p>
          </div>
        ) : (
          <div className="bg-gray-800 rounded-xl overflow-x-auto">
            <div className="px-3 py-2 border-b border-gray-700">
              <span className="text-xs text-gray-500">{pendingListings.length} pending — not purchasable, for reference only</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-400 border-b border-gray-700 text-xs">
                  <th className="px-3 py-3 font-medium">Address</th>
                  <th className="px-3 py-3 font-medium">Price</th>
                  <th className="px-3 py-3 font-medium">Bd/Ba/Sqft</th>
                  <th className="px-3 py-3 font-medium">Cash Flow</th>
                  <th className="px-3 py-3 font-medium">Rent %</th>
                  <th className="px-3 py-3 font-medium">Cap</th>
                  <th className="px-3 py-3 font-medium">CoC</th>
                  <th className="px-3 py-3 font-medium">5yr ROI</th>
                  <th className="px-3 py-3 font-medium">30y ATROI</th>
                  <th className="px-3 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {pendingListings.map(listing => {
                  const metrics = metricsMap[listing.mls_num];
                  return (
                    <tr key={listing.mls_num} className="hover:bg-gray-750 text-gray-400">
                      <td className="px-3 py-2">
                        <div className="text-gray-300 text-xs">{listing.address}</div>
                        <div className="text-gray-600 text-xs">{listing.mls_num}</div>
                      </td>
                      <td className="px-3 py-2 text-xs whitespace-nowrap">
                        <div className="text-gray-300">{fmt$(listing.price)}</div>
                      </td>
                      <td className="px-2 py-2 text-gray-300 text-xs whitespace-nowrap">
                        <div>{listing.beds ?? '—'}bd/{listing.baths ?? '—'}ba</div>
                        <div className="text-gray-500">{listing.sqft ? listing.sqft.toLocaleString() : '—'} sf</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{metrics ? <span className={metrics.cf >= 0 ? 'text-green-400' : 'text-red-400'}>{fmt$(metrics.cf)}</span> : '—'}</td>
                      <td className="px-3 py-2 text-xs">{metrics?.rentPct != null ? <span className={metrics.rentPct >= 1.1 ? 'text-green-400' : 'text-red-400'}>{metrics.rentPct.toFixed(2)}%</span> : '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-300">{metrics ? fmtPct(metrics.cap) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-300">{metrics ? fmtPct(metrics.coc) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-300">{metrics ? fmtPct(metrics.roi5) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-300">{metrics ? fmtPct(metrics.atroi) : '—'}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">{listing.mark_notes ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Active Table */}
      {activeTab === 'active' && listings.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-400 text-lg mb-2">No listings yet.</p>
          <p className="text-gray-600 text-sm">
            The GitHub Actions workflow will fetch properties automatically each morning,
            or run <code className="bg-gray-700 px-1.5 py-0.5 rounded">npm run scout</code> locally to fetch now.
          </p>
        </div>
      ) : activeTab === 'active' && (
        <div className="bg-gray-800 rounded-xl overflow-x-auto">
          <div className="px-3 py-2 border-b border-gray-700 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Showing top {listings.length} by <span className="text-gray-400 font-medium">{sortCol}</span> ({sortDir})
              {(debouncedSearch || priceMin || priceMax || rentPctMin || cfMin || capMin || bedsMin) && ' · filtered'}
            </span>
            <span className="text-xs text-gray-400">
              {filtered.length} shown after status filter
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700 text-xs">
                {[
                  { col: null,     label: 'Address' },
                  { col: 'price',  label: 'Price' },
                  { col: 'beds',   label: 'Bd/Ba/Sqft' },
                  { col: null,     label: 'Repairs $' },
                  { col: null,     label: 'HOA $/qtr' },
                  { col: null,    label: 'Est. Rent' },
                  { col: 'cf',      label: 'Cash Flow' },
                  { col: 'rentPct', label: 'Rent %' },
                  { col: 'cap',     label: 'Cap' },
                  { col: 'coc',     label: 'CoC' },
                  { col: 'roi5',    label: '5yr ROI' },
                  { col: 'atroi',   label: '30y ATROI' },
                  { col: null,    label: 'Group Deal' },
                  { col: null,    label: 'Prop Tax' },
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
                      {editingAddress === listing.mls_num ? (
                        <input
                          autoFocus
                          type="text"
                          defaultValue={listing.address}
                          onBlur={e => {
                            const val = e.target.value.trim();
                            setEditingAddress(null);
                            if (val && val !== listing.address) patchListing(listing.mls_num, { address: val });
                          }}
                          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') { setEditingAddress(null); } }}
                          className="w-full bg-gray-700 border border-blue-500 rounded px-2 py-1 text-white text-xs focus:outline-none"
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => copyToClipboard(listing.address)}
                            className="text-gray-400 hover:text-white flex-shrink-0"
                            title="Copy address"
                          >⎘</button>
                          <div
                            className="font-medium text-white text-xs leading-tight cursor-pointer hover:text-blue-300 group"
                            title="Click to edit address"
                            onClick={() => setEditingAddress(listing.mls_num)}
                          >
                            {listing.href ? (
                              <a href={listing.href} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors" onClick={e => e.stopPropagation()}>
                                {listing.address}
                              </a>
                            ) : (
                              listing.address
                            )}
                            <span className="ml-1 text-gray-600 opacity-0 group-hover:opacity-100 text-xs">✎</span>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-gray-400 text-xs">{listing.mls_num}</span>
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
                      {duplicateSet.has(listing.mls_num) && (() => {
                        const pair = duplicatePairs.find(p => p.manual.mls_num === listing.mls_num || p.scraped.mls_num === listing.mls_num);
                        return pair ? (
                          <div className="mt-1">
                            <button
                              onClick={() => openMerge(pair)}
                              className="inline-flex items-center gap-1 bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-yellow-500/30"
                            >
                              ⚠ Duplicate — Merge
                            </button>
                          </div>
                        ) : null;
                      })()}
                      {isRelisted && (
                        <div className="mt-1">
                          <span className="inline-flex items-center gap-1 bg-orange-500/20 border border-orange-500/50 text-orange-300 text-xs font-bold px-1.5 py-0.5 rounded">
                            ↩ RELISTED{absenceLabel ? ` (gone ${absenceLabel})` : ''}
                          </span>
                        </div>
                      )}
                      {firstSeenDate && (
                        <div className="text-gray-400 text-xs mt-0.5">First seen: {firstSeenDate}</div>
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
                      <input
                        type="number"
                        value={inputValues[listing.mls_num]?.price ?? (listing.price != null ? String(listing.price) : '')}
                        onChange={e => setTyping(listing.mls_num, 'price', e.target.value)}
                        onBlur={e => {
                          const raw = e.target.value;
                          const prev = listing.price;
                          setInputValues(v => {
                            const next = { ...v, [listing.mls_num]: { ...(v[listing.mls_num] ?? {}) } };
                            delete next[listing.mls_num].price;
                            return next;
                          });
                          const val = raw === '' ? null : Number(raw);
                          if (val !== prev) patchListing(listing.mls_num, { price: val });
                        }}
                        placeholder="—"
                        className="w-24 bg-transparent font-mono text-white text-xs focus:outline-none focus:bg-gray-700 rounded px-1"
                      />
                      {priceDiff !== null && (
                        <div className={`text-xs font-medium ${priceDiff < 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {priceDiff < 0 ? '↓' : '↑'}{fmt$(Math.abs(priceDiff))}
                        </div>
                      )}
                    </td>

                    {/* Beds/Baths/Sqft */}
                    <td className="px-2 py-2 text-gray-300 text-xs whitespace-nowrap">
                      <div>{listing.beds ?? '—'}bd/{listing.baths ?? '—'}ba</div>
                      <div className="text-gray-500">{listing.sqft ? listing.sqft.toLocaleString() : '—'} sf</div>
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
                        className={`w-14 bg-gray-700 rounded px-2 py-1 text-white text-xs focus:outline-none ${
                          hoaIsZero
                            ? 'border border-green-600 focus:border-green-400'
                            : 'border border-cyan-800/60 focus:border-cyan-500'
                        }`}
                        title={hoaSetAt ? `Entered on ${hoaSetAt}` : 'Type value then press Enter to save'}
                      />
                      {hoaIsZero && (
                        <div
                          className="mt-0.5 flex items-center gap-0.5 bg-green-900/50 border border-green-700/60 text-green-300 text-xs font-bold px-1.5 py-0.5 rounded cursor-default w-fit"
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

                    {/* Rent % */}
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {metrics?.rentPct != null ? (
                        <span className={`font-bold ${metrics.rentPct >= 1.1 ? 'text-green-400' : 'text-red-400'}`}>
                          {metrics.rentPct.toFixed(2)}%
                        </span>
                      ) : <span className="text-gray-500">—</span>}
                    </td>

                    {/* Cap Rate */}
                    <td className="px-3 py-2 whitespace-nowrap text-gray-300 text-xs">
                      {metrics ? fmtPct(metrics.cap) : '—'}
                    </td>

                    {/* CoC */}
                    <td className="px-3 py-2 whitespace-nowrap text-gray-300 text-xs">
                      {metrics ? fmtPct(metrics.coc) : '—'}
                    </td>

                    {/* 5yr ROI */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Roi5Badge value={metrics?.roi5 ?? null} />
                    </td>

                    {/* ATROI */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      <AtroiBadge value={metrics?.atroi ?? null} err={metrics?.atroiErr} />
                    </td>

                    {/* Group Deal */}
                    <td className="px-2 py-1 text-xs whitespace-nowrap">
                      {metrics?.group ? (() => {
                        const g = metrics.group;
                        const row = (label, roi, profit) => {
                          if (roi == null) return <div className="text-gray-600">{label} —</div>;
                          const good = roi >= 8;
                          const profitK = profit != null ? ` ($${Math.round(profit/1000)}K)` : '';
                          return (
                            <div className={good ? 'text-green-400' : 'text-red-400'}>
                              {label} {roi.toFixed(1)}%<span className="text-gray-400">{profitK}</span>
                            </div>
                          );
                        };
                        return (
                          <div className="flex flex-col gap-0.5 font-medium">
                            {row('Eq ', g.equityROI5,  g.equityProfit)}
                            {row('Mgr', g.managerROI5, g.mgrProfit)}
                          </div>
                        );
                      })() : <span className="text-gray-600">—</span>}
                    </td>

                    {/* Prop Tax */}
                    <td className="px-1 text-center">
                      {(() => {
                        const streetPart = (listing.address || '').split(',')[0].trim();
                        const tokens = streetPart.split(/\s+/).slice(0, 2).join(' ');
                        const acct = listing.tax_account_num;
                        const lookupUrl = acct
                          ? `https://www.tax.tarrantcountytx.gov/Accounts/AccountDetails?taxAccountNumber=${acct}`
                          : `https://www.tax.tarrantcountytx.gov/Search/Results?Query.SearchField=5&Query.SearchText=${encodeURIComponent(tokens)}&Query.SearchAction=&Query.PropertyType=&Query.IncludeInactiveAccounts=False&Query.PayStatus=Both`;

                        if (editingTax === listing.mls_num) {
                          return (
                            <input autoFocus type="number" placeholder="annual $"
                              defaultValue={listing.tax_annual ? Math.round(Number(listing.tax_annual)) : ''}
                              onBlur={e => { const val = e.target.value.trim(); setEditingTax(null); if (val) patchListing(listing.mls_num, { tax_annual: Number(val) }); }}
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTax(null); }}
                              className="w-20 bg-gray-700 border border-blue-500 rounded px-1 py-0.5 text-white text-xs focus:outline-none"
                            />
                          );
                        }
                        if (editingTaxAcct === listing.mls_num) {
                          return (
                            <input autoFocus type="text" placeholder="acct #"
                              defaultValue={acct || ''}
                              onBlur={e => { const val = e.target.value.trim(); setEditingTaxAcct(null); if (val) patchListing(listing.mls_num, { tax_account_num: val }); }}
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingTaxAcct(null); }}
                              className="w-24 bg-gray-700 border border-amber-500 rounded px-1 py-0.5 text-white text-xs focus:outline-none"
                            />
                          );
                        }
                        return (
                          <div className="flex flex-col items-center gap-0.5">
                            {listing.tax_annual ? (
                              <>
                                <button onClick={() => setEditingTax(listing.mls_num)}
                                        className="text-xs text-gray-400 hover:text-white" title="Click to edit">
                                  ${Math.round(Number(listing.tax_annual)/12)}/mo
                                </button>
                                <span className="text-xs text-gray-600">${Math.round(Number(listing.tax_annual)).toLocaleString()}/yr</span>
                              </>
                            ) : (
                              <button onClick={() => setEditingTax(listing.mls_num)}
                                      className="text-xs text-gray-600 hover:text-gray-300 italic"
                                      title="Estimated at 2.3% — click to enter actual">
                                ~${listing.price ? Math.round(Number(listing.price) * 0.023 / 12).toLocaleString() : '—'}/mo
                              </button>
                            )}
                            <a href={lookupUrl} target="_blank" rel="noreferrer"
                               className="text-xs text-blue-400 hover:text-blue-300 underline"
                               title={acct ? `Account ${acct}` : 'Search Tarrant County tax site'}>
                              {acct ? 'view acct' : 'Tax ↗'}
                            </a>
                            <button onClick={() => setEditingTaxAcct(listing.mls_num)}
                                    className="text-xs text-gray-600 hover:text-gray-400"
                                    title={acct ? `Account: ${acct} — click to edit` : 'Enter account number from county site'}>
                              {acct ? `#${acct}` : 'acct#'}
                            </button>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Notes */}
                    <td className="px-3 py-2">
                      <textarea
                        rows={2}
                        value={notesInput}
                        onChange={e => setTyping(listing.mls_num, 'mark_notes', e.target.value)}
                        onBlur={() => commitField(listing.mls_num, 'mark_notes', notesInput, notesVal)}
                        placeholder="Notes…"
                        className="w-20 bg-gray-700 border border-gray-600 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500 resize-none"
                        title="Click away or Tab to save"
                      />
                    </td>

                    {/* Mark */}
                    <td className="px-1 py-2">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => patchMark(listing.mls_num, { status: mark.status === 'potential' ? null : 'potential' })}
                          className={`px-1.5 py-0.5 text-xs rounded font-medium transition-colors ${
                            mark.status === 'potential'
                              ? 'bg-green-700 text-green-100'
                              : 'bg-gray-700 text-gray-400 hover:bg-green-900/50 hover:text-green-300'
                          }`}
                        >
                          ✓ Buy
                        </button>
                        <button
                          onClick={() => patchMark(listing.mls_num, { status: mark.status === 'skip' ? null : 'skip' })}
                          className={`px-1.5 py-0.5 text-xs rounded font-medium transition-colors ${
                            mark.status === 'skip'
                              ? 'bg-red-800 text-red-100'
                              : 'bg-gray-700 text-gray-400 hover:bg-red-900/50 hover:text-red-300'
                          }`}
                        >
                          ✗ Skip
                        </button>
                        {listing.source !== 'pam' && (
                          <button
                            onClick={() => deleteListing(listing.mls_num)}
                            className="px-2 py-1 text-xs rounded font-medium bg-gray-700 text-gray-500 hover:bg-red-900/60 hover:text-red-400 transition-colors"
                            title="Delete this listing"
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
