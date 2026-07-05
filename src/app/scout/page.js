'use client';
import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import { calcM, calcGroup, calcOptionA, calcOptionC, DEFAULTS } from '@/lib/calcMetrics';

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

function addrKey(address, apt_number) {
  if (!address) return null;
  const norm = address.toLowerCase()
    .replace(/\bdrive\b/g, 'dr').replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave')
    .replace(/\bboulevard\b/g, 'blvd').replace(/\broad\b/g, 'rd').replace(/\blane\b/g, 'ln')
    .replace(/\bcourt\b/g, 'ct').replace(/\bcircle\b/g, 'cir').replace(/\bplace\b/g, 'pl')
    .replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim();
  const tokens = norm.split(' ');
  if (tokens.length < 2 || !/^\d+/.test(tokens[0])) return null;
  const baseKey = tokens[0] + ' ' + tokens[1]; // e.g. "1712 haven"
  return apt_number ? `${baseKey}#${apt_number}` : baseKey;
}

const MERGE_FIELDS = [
  { key: 'address',       label: 'Address',    src: 'listing' },
  { key: 'apt_number',    label: 'Apt/Unit',   src: 'listing' },
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
  if (source === 'pam') return 'PAMS Texas';
  if (source === 'manual') return 'Manual';
  return source ?? '—';
}

function getPropertyTypeColor(propertyType) {
  if (!propertyType) return '';
  const lower = propertyType.toLowerCase();
  if (lower.includes('mobile') || lower.includes('manufactured') || lower.includes('trailer')) {
    console.log(`Mobile: ${propertyType}`);
    return 'bg-orange-900/40 border-l-2 border-orange-500';
  }
  if (lower.includes('apartment') || lower.includes('condo') || lower.includes('townhouse') || lower.includes('town home')) {
    console.log(`Apartment: ${propertyType}`);
    return 'bg-blue-900/40 border-l-2 border-blue-500';
  }
  if (lower.includes('multi') || lower.includes('duplex') || lower.includes('triplex')) {
    console.log(`Multi-unit: ${propertyType}`);
    return 'bg-purple-900/40 border-l-2 border-purple-500';
  }
  if (propertyType) {
    console.log(`Unknown type: ${propertyType}`);
  }
  return '';
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

function ScoutPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({ total: 0, countA: 0, countB: 0, countC: 0, skip: 0, sold: 0, great: 0, pending: 0 });
  const [pendingListings, setPendingListings] = useState([]);
  const [toastMsg, setToastMsg] = useState('');
  const listingsRef = useRef([]);
  const pendingListingsRef = useRef([]);
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

  // Keep refs in sync so patchMark can look up addresses without stale closures
  useEffect(() => { listingsRef.current = listings; }, [listings]);
  useEffect(() => { pendingListingsRef.current = pendingListings; }, [pendingListings]);

  // Merge modal
  const [mergePair, setMergePair] = useState(null); // { manual, scraped }
  const [mergeChoices, setMergeChoices] = useState({}); // { keep:'scraped'|'manual', [field]:'manual'|'scraped' }
  const [mergeSaving, setMergeSaving] = useState(false);

  // Relisting history popover
  const [relistingHistory, setRelistingHistory] = useState(null); // { mls_num, address, rows } | null
  const [relistingLoading, setRelistingLoading] = useState(false);
  const openRelistingHistory = useCallback(async (listing) => {
    setRelistingLoading(true);
    setRelistingHistory({ mls_num: listing.mls_num, address: listing.address, rows: null });
    try {
      const res = await fetch(`/api/scout/relisting-log?mls_num=${encodeURIComponent(listing.mls_num)}`);
      const rows = await res.json();
      setRelistingHistory({ mls_num: listing.mls_num, address: listing.address, rows });
    } catch {
      setRelistingHistory({ mls_num: listing.mls_num, address: listing.address, rows: [] });
    } finally {
      setRelistingLoading(false);
    }
  }, []);

  // Manual-add modal
  const [addOpen, setAddOpen] = useState(false);
  const EMPTY_FORM = { address: '', price: '', beds: '', baths: '', sqft: '', year_built: '', hoa_yn: '', href: '', rent_override: '', repair_costs: '', hoa_quarterly: '', notes: '', apt_number: '' };
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);

  const [taxFetching, setTaxFetching] = useState({}); // mls_num → true while fetching
  const [taxBulkRunning, setTaxBulkRunning] = useState(false);
  const [taxBulkProgress, setTaxBulkProgress] = useState(null); // "12/100"
  const [editingTax, setEditingTax] = useState(null);     // mls_num editing annual amount
  const [editingTaxAcct, setEditingTaxAcct] = useState(null); // mls_num editing account number

  // Sold date picker state: mls_num of listing showing the month picker
  const [soldPickerMls, setSoldPickerMls] = useState(null);

  // Top-level tab
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'active');

  // Filter / search / page — initialised from URL so refresh restores state
  // Map legacy 'potential' status to 'a'
  const [filterStatus, setFilterStatus] = useState(() => {
    const s = searchParams.get('status') || 'all';
    return s === 'potential' ? 'a' : s;
  });
  const [filterSource, setFilterSource] = useState(() => searchParams.get('source') || 'all');
  const [filterEntry, setFilterEntry] = useState(() => searchParams.get('entry') || 'all');
  const [priceMin, setPriceMin] = useState(() => searchParams.get('priceMin') || '');
  const [priceMax, setPriceMax] = useState(() => searchParams.get('priceMax') || '');
  const [rentPctMin, setRentPctMin] = useState(() => searchParams.get('rentPctMin') || '');
  const [cfMin, setCfMin] = useState(() => searchParams.get('cfMin') || '');
  const [capMin, setCapMin] = useState(() => searchParams.get('capMin') || '');
  const [bedsMin, setBedsMin] = useState(() => searchParams.get('bedsMin') || '');
  const [bedsMax, setBedsMax] = useState(() => searchParams.get('bedsMax') || '');
  // Draft values — updated on every keystroke, committed to filter state on Enter/blur
  const [filterDrafts, setFilterDrafts] = useState({
    rentPctMin: searchParams.get('rentPctMin') || '',
    cfMin:      searchParams.get('cfMin')      || '',
    capMin:     searchParams.get('capMin')     || '',
    bedsMin:    searchParams.get('bedsMin')    || '',
    bedsMax:    searchParams.get('bedsMax')    || '',
  });
  const setDraft = (key, val) => setFilterDrafts(d => ({ ...d, [key]: val }));
  const commitDraft = (key, setter) => setter(filterDrafts[key]);
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [page, setPage] = useState(() => Math.max(1, parseInt(searchParams.get('page') || '1', 10)));

  const [sortCol, setSortCol] = useState(() => searchParams.get('sort') || 'atroi');
  const [sortDir, setSortDir] = useState(() => searchParams.get('dir')  || 'desc');

  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('search') || '');
  const commitSearch = useCallback(() => setDebouncedSearch(search), [search]);

  // Sync filter/sort state back to URL so refresh restores it
  useEffect(() => {
    const p = new URLSearchParams();
    if (activeTab     !== 'active') p.set('tab',       activeTab);
    if (sortCol       !== 'atroi')  p.set('sort',      sortCol);
    if (sortDir       !== 'desc')   p.set('dir',       sortDir);
    if (filterStatus  !== 'all')    p.set('status',    filterStatus);
    if (filterSource  !== 'all')    p.set('source',    filterSource);
    if (filterEntry   !== 'all')    p.set('entry',     filterEntry);
    if (debouncedSearch)            p.set('search',    debouncedSearch);
    if (priceMin)                   p.set('priceMin',  priceMin);
    if (priceMax)                   p.set('priceMax',  priceMax);
    if (rentPctMin)                 p.set('rentPctMin',rentPctMin);
    if (cfMin)                      p.set('cfMin',     cfMin);
    if (capMin)                     p.set('capMin',    capMin);
    if (bedsMin)                    p.set('bedsMin',   bedsMin);
    if (bedsMax)                    p.set('bedsMax',   bedsMax);
    if (page > 1)                   p.set('page',      String(page));
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [activeTab, sortCol, sortDir, filterStatus, filterSource, filterEntry, debouncedSearch, priceMin, priceMax, rentPctMin, cfMin, capMin, bedsMin, bedsMax, page]);

  const [totalCount, setTotalCount] = useState(0);

  // Fetch listings from server whenever sort/filter/search/page params change
  useEffect(() => {
    setLoading(true);
    const offset = (page - 1) * PAGE_SIZE;
    const baseParams = { sort: sortCol, dir: sortDir, search: debouncedSearch, priceMin, priceMax, rentPctMin, cfMin, capMin, bedsMin, bedsMax, status: filterStatus, source: filterSource, offset: String(offset) };
    const activeParams = new URLSearchParams({ ...baseParams, tab: 'active' });
    const pendingParams = new URLSearchParams({ ...baseParams, tab: 'pending', limit: '200', offset: '0' });
    Promise.all([
      fetch(`/api/scout/listings?${activeParams}`).then(r => r.json()),
      fetch(`/api/scout/listings?${pendingParams}`).then(r => r.json()),
      fetch('/api/scout/config').then(r => r.json()),
    ])
      .then(([activeData, pendingData, configData]) => {
        setListings(activeData.listings ?? []);
        setTotalCount(activeData.total ?? 0);
        setPendingListings(pendingData.listings ?? []);
        setStats({ ...(activeData.stats ?? { total: 0, countA: 0, countB: 0, countC: 0, skip: 0, sold: 0, great: 0 }), pending: pendingData.listings?.length ?? 0 });
        setConfig(configData);
        setConfigDraft(configData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [sortCol, sortDir, debouncedSearch, priceMin, priceMax, rentPctMin, cfMin, capMin, bedsMin, bedsMax, filterStatus, filterSource, page]);

  // Merge DB data with local edits for a row
  const getMark = useCallback((listing) => {
    const local = localEdits[listing.mls_num];
    const rawStatus = local?.status !== undefined ? local.status : listing.status;
    return {
      // Normalize legacy 'potential' to 'a'
      status: rawStatus === 'potential' ? 'a' : rawStatus,
      sold_date: local?.sold_date !== undefined ? local.sold_date : (listing.sold_date ?? null),
      repair_costs: local?.repair_costs !== undefined ? local.repair_costs : listing.repair_costs,
      hoa_quarterly: local?.hoa_quarterly !== undefined ? local.hoa_quarterly : listing.hoa_quarterly,
      rent_override: local?.rent_override !== undefined ? local.rent_override : listing.rent_override,
      rent_min: listing.rent_min,
      rent_max: listing.rent_max,
      mark_notes: local?.mark_notes !== undefined ? local.mark_notes : listing.mark_notes,
    };
  }, [localEdits]);

  const FIELD_LABEL = {
    mark_notes: 'notes', repair_costs: 'repairs',
    hoa_quarterly: 'HOA', rent_override: 'rent', status: 'status',
  };

  const patchMark = useCallback(async (mls_num, fields) => {
    // Optimistic local update
    setLocalEdits(e => ({ ...e, [mls_num]: { ...(e[mls_num] ?? {}), ...fields } }));
    try {
      // mark_notes is the SELECT alias (m.notes AS mark_notes); API expects 'notes'
      const { mark_notes, ...rest } = fields;
      const apiFields = mark_notes !== undefined ? { ...rest, notes: mark_notes } : rest;
      const res = await fetch('/api/scout/marks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls_num, ...apiFields }),
      });
      if (!res.ok) throw new Error('Save failed');
      // Sync back to listings
      setListings(ls => ls.map(l => l.mls_num === mls_num ? { ...l, ...fields } : l));

      // Activity log + toast
      const listing = listingsRef.current.find(l => l.mls_num === mls_num)
        ?? pendingListingsRef.current.find(l => l.mls_num === mls_num);
      const street = listing?.address?.split(',')[0] ?? mls_num;
      const key = Object.keys(fields)[0];
      const label = FIELD_LABEL[key] ?? key.replace(/_/g, ' ');
      const val = fields[key];
      const msg = key === 'status'
        ? (val ? `marked ${val}: ${street}` : `status cleared: ${street}`)
        : (val == null || val === '' ? `${label} cleared: ${street}` : `${label} saved: ${street}`);
      setToastMsg(msg);
      setTimeout(() => setToastMsg(''), 3000);
      fetch('/api/scout/activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg }),
      }).catch(() => {});
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

  // Compute metrics for rendered rows.
  // Always recompute client-side if the listing has any saved marks (rent, repairs, HOA, tax)
  // so we never show stale server-precomputed values when DB-saved overrides exist.
  const metricsMap = useMemo(() => {
    const m = {};
    [...listings, ...pendingListings].forEach(l => {
      const hasSavedMarks = l.rent_override != null || l.repair_costs != null
                         || l.hoa_quarterly != null || l.tax_annual != null;
      const hasLocalEdits = !!localEdits[l.mls_num];
      if (hasSavedMarks || hasLocalEdits) {
        const mark = getMark(l);
        m[l.mls_num] = { ...calcM(l, mark, DEFAULTS), group: calcGroup(l, mark, DEFAULTS), optA: calcOptionA(l, mark), optC: calcOptionC(l, mark) };
      } else {
        const src = l.cf != null ? l : null;
        m[l.mls_num] = src
          ? { cf: src.cf, cap: src.cap, coc: src.coc, atroi: src.atroi, atroiErr: src.atroiErr, roi5: src.roi5, rent: src.rent, rentPct: src.rentPct, group: src.group ?? calcGroup(l, l, DEFAULTS), optA: calcOptionA(l, l), optC: calcOptionC(l, l) }
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

  // filterEntry is client-side only (checks locally whether data has been entered)
  const filtered = useMemo(() => {
    if (filterEntry === 'all') return listings;
    return listings.filter(l => {
      if (filterEntry === 'entered'     && !hasManualEntry(l)) return false;
      if (filterEntry === 'not-entered' &&  hasManualEntry(l)) return false;
      return true;
    });
  }, [listings, filterEntry, localEdits, hasManualEntry]);

  // Server handles status filter + offset; use server total for pagination
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginated = filtered; // server already sliced to current page

  // Reset to page 1 when filter/sort/search changes (not on page change itself)
  useEffect(() => { setPage(1); }, [filterStatus, filterSource, filterEntry, sortCol, priceMin, priceMax, rentPctMin, cfMin, capMin, bedsMin, bedsMax, debouncedSearch]);

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
        apt_number: addForm.apt_number.trim() || null,
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

  // Detect potential duplicates: manual vs scraped, OR two scraped entries with same address
  const duplicatePairs = useMemo(() => {
    const manuals = listings.filter(l => l.source === 'manual');
    const scraped = listings.filter(l => l.source !== 'manual');
    const pairs = [];
    // manual vs scraped
    for (const m of manuals) {
      const mk = addrKey(m.address, m.apt_number);
      if (!mk) continue;
      for (const s of scraped) {
        if (addrKey(s.address, s.apt_number) === mk) pairs.push({ manual: m, scraped: s, type: 'manual-scraped' });
      }
    }
    // scraped vs scraped (re-listed under a new MLS number)
    const seenKeys = new Map(); // addrKey -> first entry found
    for (const s of scraped) {
      const sk = addrKey(s.address, s.apt_number);
      if (!sk) continue;
      if (seenKeys.has(sk)) {
        const existing = seenKeys.get(sk);
        // put older (earlier first_seen or lower id) in the 'manual' slot so modal logic is reused
        const older = (existing.first_seen ?? '') <= (s.first_seen ?? '') ? existing : s;
        const newer = older === existing ? s : existing;
        pairs.push({ manual: older, scraped: newer, type: 'scraped-scraped' });
      } else {
        seenKeys.set(sk, s);
      }
    }
    return pairs;
  }, [listings]);

  // Set of mls_nums that have a potential duplicate
  const duplicateSet = useMemo(() => new Set(duplicatePairs.flatMap(p => [p.manual.mls_num, p.scraped.mls_num])), [duplicatePairs]);

  const openMerge = useCallback((pair) => {
    const { manual, scraped, type } = pair;
    // For scraped-scraped: keep older (manual slot); for manual-scraped: keep scraped (more authoritative)
    const choices = { keep: type === 'scraped-scraped' ? 'manual' : 'scraped' };
    MERGE_FIELDS.forEach(({ key, src }) => {
      const mv = manual[key]; const sv = scraped[key];
      if (mv == null && sv != null) choices[key] = 'scraped';
      else if (sv == null && mv != null) choices[key] = 'manual';
      else choices[key] = src === 'listing' ? (type === 'scraped-scraped' ? 'manual' : 'scraped') : 'manual';
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
        <PageHeader title="Scout" subtitle="PAMS Texas &amp; REI Nation listings" currentPage="/scout" dark />
        <p className="text-gray-400">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <PageHeader title="Scout" subtitle="PAMS Texas &amp; REI Nation listings" currentPage="/scout" dark />
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
          <a
            href="/scout/activity"
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm font-medium rounded-lg whitespace-nowrap"
          >
            Activity
          </a>
        </div>
      </div>

      {/* Save toast */}
      {toastMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-gray-800 border border-gray-600 text-gray-200 text-xs px-4 py-2 rounded-lg shadow-lg">
          ✓ {toastMsg}
        </div>
      )}

      {/* Merge Modal */}
      {mergePair && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-gray-800 rounded-xl w-full max-w-2xl shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-white font-semibold">{mergePair.type === 'scraped-scraped' ? 'Re-Listed Property (Duplicate MLS)' : 'Potential Duplicate Detected'}</h2>
                <p className="text-gray-400 text-xs mt-0.5">{mergePair.type === 'scraped-scraped' ? 'Same address appeared under two MLS numbers. Keep one record and merge any notes/data.' : 'Choose which values to keep, then merge into one record.'}</p>
              </div>
              <button onClick={() => setMergePair(null)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
              {/* Keep which record */}
              <div className="flex items-center gap-6 mb-4 p-3 bg-gray-700/50 rounded-lg">
                <span className="text-xs text-gray-400 font-medium">Keep record:</span>
                {[
                  { val: 'scraped', label: mergePair.type === 'scraped-scraped' ? `Newer listing (${mergePair.scraped.mls_num})` : `${sourceLabel(mergePair.scraped.source)} (${mergePair.scraped.mls_num})` },
                  { val: 'manual',  label: mergePair.type === 'scraped-scraped' ? `Older listing (${mergePair.manual.mls_num})` : `Manual (${mergePair.manual.mls_num})` },
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
                    <th className="text-left py-1.5">{mergePair.type === 'scraped-scraped' ? `Older (${mergePair.manual.mls_num})` : 'Manual entry'}</th>
                    <th className="text-left py-1.5">{mergePair.type === 'scraped-scraped' ? `Newer (${mergePair.scraped.mls_num})` : sourceLabel(mergePair.scraped.source)}</th>
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

      {/* Relisting History Modal */}
      {relistingHistory && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setRelistingHistory(null)}>
          <div className="bg-gray-800 rounded-xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div>
                <h2 className="text-white font-semibold text-sm">Relisting History</h2>
                <p className="text-gray-400 text-xs mt-0.5 truncate max-w-[300px]">{relistingHistory.address}</p>
              </div>
              <button onClick={() => setRelistingHistory(null)} className="text-gray-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
              {relistingLoading || relistingHistory.rows === null ? (
                <p className="text-gray-400 text-sm">Loading…</p>
              ) : relistingHistory.rows.length === 0 ? (
                <p className="text-gray-400 text-sm">No history logged yet. Events will be recorded on the next scraper run.</p>
              ) : (
                <ol className="relative border-l border-gray-600 ml-2 space-y-4">
                  {relistingHistory.rows.map((row, i) => {
                    const date = new Date(row.event_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
                    const isReappear = row.event === 'reappeared';
                    return (
                      <li key={i} className="ml-4">
                        <span className={`absolute -left-1.5 mt-1 w-3 h-3 rounded-full border-2 ${isReappear ? 'bg-green-500 border-green-400' : 'bg-red-500 border-red-400'}`} />
                        <div className="flex items-baseline gap-2">
                          <span className={`text-xs font-bold ${isReappear ? 'text-green-400' : 'text-red-400'}`}>
                            {isReappear ? '↩ Reappeared' : '✕ Disappeared'}
                          </span>
                          <span className="text-gray-400 text-xs">{date}</span>
                        </div>
                        {isReappear && row.absence_days != null && (
                          <p className="text-gray-500 text-xs mt-0.5">
                            Gone for {row.absence_days} day{row.absence_days !== 1 ? 's' : ''}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
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
              <label className="flex flex-col gap-1">
                <span className="text-xs text-gray-400">Apt/Unit # (optional)</span>
                <input
                  type="text"
                  value={addForm.apt_number}
                  onChange={e => setAddForm(f => ({ ...f, apt_number: e.target.value }))}
                  placeholder="e.g., 212, Unit A"
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
          A: <span className="font-bold text-blue-400">{stats.countA}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          B: <span className="font-bold text-cyan-400">{stats.countB}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          C: <span className="font-bold text-teal-400">{stats.countC}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Skip: <span className="font-bold text-red-400">{stats.skip}</span>
        </span>
        <span className="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300">
          Sold: <span className="font-bold text-orange-400">{stats.sold}</span>
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

      {/* Property Type Legend */}
      <div className="flex flex-wrap gap-2 mb-4 text-xs">
        <span className="text-gray-500">Property Type:</span>
        <div className="flex gap-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-l-2 border-orange-500 bg-orange-900/40 rounded px-1"></div>
            <span className="text-gray-400">Mobile Home</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-l-2 border-blue-500 bg-blue-900/40 rounded px-1"></div>
            <span className="text-gray-400">Apartment/Condo</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 border-l-2 border-purple-500 bg-purple-900/40 rounded px-1"></div>
            <span className="text-gray-400">Multi-Unit</span>
          </div>
        </div>
      </div>

      {/* Filter / Sort Bar — Active tab only */}
      {activeTab === 'active' && <div className="flex flex-wrap gap-3 items-center mb-4">
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {[
            { key: 'all',      label: 'All',       activeClass: 'bg-blue-600 text-white' },
            { key: 'a',        label: 'A',          activeClass: 'bg-blue-700 text-white' },
            { key: 'b',        label: 'B',          activeClass: 'bg-cyan-700 text-white' },
            { key: 'c',        label: 'C',          activeClass: 'bg-teal-700 text-white' },
            { key: 'not-skip', label: 'Active',     activeClass: 'bg-blue-600 text-white' },
            { key: 'skip',     label: 'Skip',       activeClass: 'bg-red-700 text-white' },
            { key: 'sold',     label: 'Sold',       activeClass: 'bg-orange-700 text-white' },
            { key: 'unmarked', label: 'Unmarked',   activeClass: 'bg-gray-600 text-white' },
          ].map(({ key, label, activeClass }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                filterStatus === key ? activeClass : 'text-gray-400 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {[
            { key: 'all',       label: 'All Sources', href: null },
            { key: 'pam',       label: 'PAMS Texas',  href: 'https://pamtexas.idxbroker.com' },
            { key: 'reination', label: 'REI Nation',   href: 'https://www.reination.com' },
          ].map(({ key, label, href }) => (
            <div key={key} className="flex items-center">
              <button
                onClick={() => setFilterSource(key)}
                className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
                  filterSource === key
                    ? 'bg-indigo-600 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {label}
              </button>
              {href && (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-0.5 text-gray-600 hover:text-indigo-400 text-xs"
                  title={`Open ${label} website`}
                >↗</a>
              )}
            </div>
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
          { label: 'Beds ≤',  key: 'bedsMax',    setter: setBedsMax,    placeholder: '4',   width: 'w-10' },
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
          <button
            onClick={() => {
              setPriceMin(''); setPriceMax(''); setRentPctMin(''); setCfMin(''); setCapMin('');
              setBedsMin(''); setBedsMax(''); setSearch(''); setDebouncedSearch('');
              setFilterDrafts({ rentPctMin: '', cfMin: '', capMin: '', bedsMin: '', bedsMax: '' });
            }}
            className="bg-red-900 hover:bg-red-800 text-red-300 text-xs px-3 py-1.5 rounded-lg border border-red-700"
          >Clear filters</button>
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
              Sorted by <span className="text-gray-400 font-medium">{sortCol}</span> ({sortDir})
              {(debouncedSearch || priceMin || priceMax || rentPctMin || cfMin || capMin || bedsMin || bedsMax || filterStatus !== 'all') && ' · filtered'}
            </span>
            <span className="text-xs text-gray-400">
              {totalCount.toLocaleString()} total · page {page} of {totalPages}
            </span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-700 text-xs">
                {[
                  { col: null,     label: 'Address' },
                  { col: 'beds',   label: 'Bd/Ba/Sqft' },
                  { col: 'price',  label: 'Price' },
                  { col: null,     label: 'Repairs $' },
                  { col: null,     label: 'HOA',        label2: '$/qtr' },
                  { col: null,     label: 'Rent',       label2: '$/mo' },
                  { col: 'cf',     label: 'Cash Flow' },
                  { col: 'rentPct',label: 'Rent %' },
                  { col: 'cap',    label: 'Cap' },
                  { col: 'coc',    label: 'CoC' },
                  { col: 'roi5',   label: '5yr / 30yr', sortLabel: '5yr ROI' },
                  { col: 'groupEq',label: 'Group Deal' },
                  { col: null,     label: 'Opt A',      label2: '20%' },
                  { col: null,     label: 'Opt C',      label2: '30%' },
                  { col: null,     label: 'Prop Tax' },
                  { col: null,     label: 'Notes' },
                  { col: null,     label: 'Mark' },
                ].map(({ col, label, label2, sortLabel }) => (
                  <th
                    key={label}
                    className={`px-2 py-3 font-medium select-none leading-tight ${col ? 'cursor-pointer hover:text-white' : ''}`}
                    onClick={col ? () => handleSort(col) : undefined}
                    title={col ? `Sort by ${sortLabel || label}` : undefined}
                  >
                    <div>{label}</div>
                    {label2 && <div className="text-gray-500 font-normal">{label2}</div>}
                    {col && sortCol === col && (
                      <span className="text-blue-400">{sortDir === 'desc' ? '↓' : '↑'}</span>
                    )}
                    {col && sortCol !== col && (
                      <span className="text-gray-600">↕</span>
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

                const addrParts  = (listing.address || '').split(',');
                const streetLine = addrParts[0]?.trim() || '';
                const cityLine   = [addrParts[1]?.trim(), addrParts[2]?.trim()].filter(Boolean).join(', ');
                const copyAddr   = [streetLine, addrParts[1]?.trim()].filter(Boolean).join(', ');

                const propTypeClass = getPropertyTypeColor(listing.property_type);
                return (
                  <tr key={listing.mls_num} className={`hover:bg-gray-750 align-top ${propTypeClass} ${touched ? (propTypeClass ? '' : 'border-l-2 border-amber-500/70') : ''}`}>
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
                        <div className="flex items-start gap-1">
                          <button
                            onClick={() => copyToClipboard(copyAddr)}
                            className="text-gray-400 hover:text-white flex-shrink-0 mt-0.5"
                            title="Copy street + city"
                          >⎘</button>
                          <div
                            className="font-medium text-white text-xs leading-tight cursor-pointer hover:text-blue-300 group"
                            title="Click to edit address"
                            onClick={() => setEditingAddress(listing.mls_num)}
                          >
                            {listing.href ? (
                              <a href={listing.href} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400 transition-colors" onClick={e => e.stopPropagation()}>
                                <div>{streetLine} {listing.apt_number && <span className="text-blue-400">#{listing.apt_number}</span>}</div>
                                <div className="text-gray-400">{cityLine}</div>
                              </a>
                            ) : (
                              <>
                                <div>{streetLine} {listing.apt_number && <span className="text-blue-400">#{listing.apt_number}</span>}</div>
                                <div className="text-gray-400">{cityLine}</div>
                              </>
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
                        {listing.href && (
                          <a
                            href={listing.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 hover:text-indigo-200 text-xs font-bold"
                            title={`View on ${listing.source === 'reination' ? 'REI Nation' : listing.source === 'pam' ? 'PAMS Texas' : 'source'}`}
                          >
                            {listing.source === 'reination' ? 'REI↗' : listing.source === 'pam' ? 'PAM↗' : '↗'}
                          </a>
                        )}
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
                          <button
                            onClick={() => openRelistingHistory(listing)}
                            className="inline-flex items-center gap-1 bg-orange-500/20 border border-orange-500/50 text-orange-300 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-orange-500/30 cursor-pointer"
                            title="View relisting history"
                          >
                            ↩ RELISTED ×{listing.reappeared_count}{absenceLabel ? ` (gone ${absenceLabel})` : ''}
                          </button>
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

                    {/* Beds/Baths/Sqft */}
                    <td className="px-2 py-2 text-gray-300 text-xs whitespace-nowrap">
                      <div>{listing.beds ?? '—'}bd/{listing.baths ?? '—'}ba</div>
                      <div className="text-gray-500">{listing.sqft ? listing.sqft.toLocaleString() : '—'} sf</div>
                    </td>

                    {/* Price */}
                    <td className="px-2 py-2 whitespace-nowrap">
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
                        className="w-16 bg-transparent font-mono text-white text-xs focus:outline-none focus:bg-gray-700 rounded px-1"
                      />
                      {priceDiff !== null && (
                        <div className={`text-xs font-medium ${priceDiff < 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {priceDiff < 0 ? '↓' : '↑'}{fmt$(Math.abs(priceDiff))}
                        </div>
                      )}
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
                        className="w-16 bg-gray-700 border border-blue-800/60 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-blue-500"
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

                    {/* 5yr / 30yr combined */}
                    <td className="px-2 py-2 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Roi5Badge value={metrics?.roi5 ?? null} />
                        <span className="text-gray-600 text-xs">/</span>
                        <AtroiBadge value={metrics?.atroi ?? null} err={metrics?.atroiErr} />
                      </div>
                    </td>

                    {/* Group Deal */}
                    <td className="px-2 py-1 text-xs whitespace-nowrap">
                      {metrics?.group ? (() => {
                        const g = metrics.group;
                        const s = g.scenarios;
                        const rangeRow = (label, roiLo, roiMid, roiHi) => {
                          if (roiMid == null) return <div className="text-gray-600">{label} —</div>;
                          const good = roiMid >= 8;
                          const loStr  = roiLo  != null ? roiLo.toFixed(0)  : '?';
                          const midStr = roiMid != null ? roiMid.toFixed(1) : '?';
                          const hiStr  = roiHi  != null ? roiHi.toFixed(0)  : '?';
                          return (
                            <div className={good ? 'text-green-400' : 'text-yellow-500'}>
                              {label} <span className="text-gray-500">{loStr}–</span>{midStr}<span className="text-gray-500">–{hiStr}%</span>
                            </div>
                          );
                        };
                        // Tooltip breakdown
                        const eqCF5   = g.equityCFMo * 60;
                        const eqProc  = g.equityProceeds;
                        const mgrProc = Math.round((g.mgrProfit + g.perEquityInvestor) - (g.equityProfit + g.perEquityInvestor) + (g.equityProceeds));
                        const debtPct = Math.round((g.perDebtInvestor * 2) / (g.perDebtInvestor * 2 + g.perEquityInvestor * 2) * 100);
                        const tooltip = [
                          `── Capital (${debtPct}% debt / ${100-debtPct}% equity) ──`,
                          `Debt investor (×2):   $${Math.round(g.perDebtInvestor/1000)}K each  →  8%/yr fixed  ($${Math.round(g.debtReturn5yr/1000)}K over 5yr)`,
                          `Equity investor (×2): $${Math.round(g.perEquityInvestor/1000)}K each  →  silent 45% / mgr 55% of equity`,
                          `── Equity returns at 3% appreciation ──`,
                          `Monthly CF to equity: $${g.equityCFMo}/mo  →  $${Math.round(eqCF5/1000)}K over 5yr (silent share)`,
                          `Sale proceeds to equity: $${Math.round(eqProc/1000)}K (silent share)`,
                          `Silent equity:  $${Math.round(g.equityProfit/1000)}K profit  →  ${g.equityROI5?.toFixed(1)}%/yr annualized`,
                          `Manager:        $${Math.round(g.mgrProfit/1000)}K profit  →  ${g.managerROI5?.toFixed(1)}%/yr annualized`,
                          `Debt investor:  $${Math.round(g.debtReturn5yr/1000)}K interest  →  8.0%/yr (fixed)`,
                          `── Range = 0% / 3% / 5% annual appreciation ──`,
                        ].join('\n');
                        return (
                          <div
                            className="flex flex-col gap-0.5 font-medium cursor-pointer select-none"
                            title={tooltip + '\n\n(click to copy)'}
                            onClick={() => copyToClipboard(tooltip)}
                          >
                            {rangeRow('Eq ', s?.at0?.equityROI5,  g.equityROI5,  s?.at5?.equityROI5)}
                            {rangeRow('Mgr', s?.at0?.managerROI5, g.managerROI5, s?.at5?.managerROI5)}
                          </div>
                        );
                      })() : <span className="text-gray-600">—</span>}
                    </td>

                    {/* Option A — 20% promote */}
                    {(() => {
                      const o = metrics?.optA;
                      if (!o) return <td className="px-2 py-1 text-gray-600 text-xs">—</td>;
                      const good = o.managerROI != null && o.managerROI >= 8;
                      const fmtR = v => v == null ? '—' : `${v.toFixed(1)}%`;
                      const tooltip = [
                        `Option A: Equal equity + 20% exit promote`,
                        `Hurdle: ${(o.promoteRate * 100).toFixed(0)}% promote above debt rate`,
                        `Promote kicked in: ${o.promoteKicked ? 'Yes' : 'No (split 50/50)'}`,
                        ``,
                        `At 0% app:  Eq ${fmtR(o.at0?.silentROI)} / Mgr ${fmtR(o.at0?.managerROI)}`,
                        `At 3% app:  Eq ${fmtR(o.silentROI)} / Mgr ${fmtR(o.managerROI)}`,
                        `At 5% app:  Eq ${fmtR(o.at5?.silentROI)} / Mgr ${fmtR(o.at5?.managerROI)}`,
                        ``,
                        `Each equity investor: $${Math.round(o.perEquityInvestor/1000)}K`,
                        `(click to copy)`,
                      ].join('\n');
                      return (
                        <td className="px-2 py-1 text-xs whitespace-nowrap cursor-pointer" title={tooltip} onClick={() => copyToClipboard(tooltip)}>
                          <div className="text-gray-400">Eq {fmtR(o.silentROI)}</div>
                          <div className={good ? 'text-green-400 font-medium' : 'text-yellow-500 font-medium'}>Mgr {fmtR(o.managerROI)}</div>
                        </td>
                      );
                    })()}

                    {/* Option C — 30% promote */}
                    {(() => {
                      const o = metrics?.optC;
                      if (!o) return <td className="px-2 py-1 text-gray-600 text-xs">—</td>;
                      const good = o.managerROI != null && o.managerROI >= 8;
                      const fmtR = v => v == null ? '—' : `${v.toFixed(1)}%`;
                      const tooltip = [
                        `Option C: Equal equity + 30% exit promote`,
                        `Hurdle: ${(o.promoteRate * 100).toFixed(0)}% promote above debt rate`,
                        `Promote kicked in: ${o.promoteKicked ? 'Yes' : 'No (split 50/50)'}`,
                        ``,
                        `At 0% app:  Eq ${fmtR(o.at0?.silentROI)} / Mgr ${fmtR(o.at0?.managerROI)}`,
                        `At 3% app:  Eq ${fmtR(o.silentROI)} / Mgr ${fmtR(o.managerROI)}`,
                        `At 5% app:  Eq ${fmtR(o.at5?.silentROI)} / Mgr ${fmtR(o.at5?.managerROI)}`,
                        ``,
                        `Each equity investor: $${Math.round(o.perEquityInvestor/1000)}K`,
                        `(click to copy)`,
                      ].join('\n');
                      return (
                        <td className="px-2 py-1 text-xs whitespace-nowrap cursor-pointer" title={tooltip} onClick={() => copyToClipboard(tooltip)}>
                          <div className="text-gray-400">Eq {fmtR(o.silentROI)}</div>
                          <div className={good ? 'text-green-400 font-medium' : 'text-yellow-500 font-medium'}>Mgr {fmtR(o.managerROI)}</div>
                        </td>
                      );
                    })()}

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
                                        className="text-xs text-gray-200 hover:text-white" title="Click to edit">
                                  ${Math.round(Number(listing.tax_annual)/12)}/mo
                                </button>
                                <span className="text-xs text-gray-400">${Math.round(Number(listing.tax_annual)).toLocaleString()}/yr</span>
                              </>
                            ) : (
                              <button onClick={() => setEditingTax(listing.mls_num)}
                                      className="text-xs text-gray-400 hover:text-white italic"
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
                        {/* Grade buttons A / B / C */}
                        {[
                          { grade: 'a', activeClass: 'bg-blue-700 text-blue-100', hoverClass: 'hover:bg-blue-900/50 hover:text-blue-300' },
                          { grade: 'b', activeClass: 'bg-cyan-700 text-cyan-100',  hoverClass: 'hover:bg-cyan-900/50 hover:text-cyan-300' },
                          { grade: 'c', activeClass: 'bg-teal-700 text-teal-100',  hoverClass: 'hover:bg-teal-900/50 hover:text-teal-300' },
                        ].map(({ grade, activeClass, hoverClass }) => (
                          <button
                            key={grade}
                            onClick={() => patchMark(listing.mls_num, { status: mark.status === grade ? null : grade })}
                            className={`px-1.5 py-0.5 text-xs rounded font-bold transition-colors ${
                              mark.status === grade
                                ? activeClass
                                : `bg-gray-700 text-gray-400 ${hoverClass}`
                            }`}
                          >
                            {grade.toUpperCase()}
                          </button>
                        ))}
                        {/* Skip */}
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
                        {/* Sold — date picker inline */}
                        {mark.status === 'sold' ? (
                          <button
                            onClick={() => {
                              patchMark(listing.mls_num, { status: null, sold_date: null });
                            }}
                            className="px-1.5 py-0.5 text-xs rounded font-medium bg-orange-900/70 text-orange-200 hover:bg-orange-900 transition-colors"
                            title="Click to unmark sold"
                          >
                            ✕ Sold{mark.sold_date ? ` ${mark.sold_date.slice(5)}/${mark.sold_date.slice(2,4)}` : ''}
                          </button>
                        ) : soldPickerMls === listing.mls_num ? (
                          <input
                            type="month"
                            autoFocus
                            className="w-28 bg-gray-700 border border-orange-500 rounded px-1 py-0.5 text-white text-xs focus:outline-none"
                            onChange={e => {
                              if (e.target.value) {
                                patchMark(listing.mls_num, { status: 'sold', sold_date: e.target.value });
                                setSoldPickerMls(null);
                                if (filterStatus === 'all' || filterStatus === 'not-skip') {
                                  setListings(ls => ls.filter(l => l.mls_num !== listing.mls_num));
                                }
                              }
                            }}
                            onBlur={() => setSoldPickerMls(null)}
                          />
                        ) : (
                          <button
                            onClick={() => setSoldPickerMls(listing.mls_num)}
                            className="px-1.5 py-0.5 text-xs rounded font-medium bg-gray-700 text-gray-400 hover:bg-orange-900/40 hover:text-orange-300 transition-colors"
                          >
                            Sold ▾
                          </button>
                        )}
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
      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-gray-400">
          <span>
            {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1.5 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors text-xs"
            >
              ««
            </button>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">pg {page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1.5 bg-gray-800 rounded disabled:opacity-40 hover:bg-gray-700 transition-colors text-xs"
            >
              »»
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function ScoutPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-gray-900 text-white p-6"><p className="text-gray-400">Loading…</p></main>}>
      <ScoutPageInner />
    </Suspense>
  );
}
