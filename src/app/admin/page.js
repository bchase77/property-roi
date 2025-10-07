"use client";
import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';

export default function AdminPage() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function load() {
    setErr(''); setLoading(true);
    try {
      const res = await fetch('/api/properties/deleted', { cache: 'no-store' });
      if (!res.ok) throw new Error(await res.text());
      setList(await res.json());
    } catch (e) {
      console.error(e);
      setErr('Failed to load deleted properties.');
    } finally { setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  const restore = async (id) => {
    if(!confirm('Restore this property?')) return;
    try {
      const res = await fetch(`/api/properties/${id}/restore`, { method: 'POST' });
      if(!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) {
      console.error(e);
      setErr('Restore failed.');
    }
  };

  const purge = async (id) => {
    if(!confirm('Permanently delete this property? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/properties/${id}/purge`, { method: 'DELETE' });
      if(!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) {
      console.error(e);
      setErr('Purge failed.');
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader 
        title="Admin — Deleted Properties"
        subtitle="Manage deleted properties: restore or permanently purge"
        currentPage="/admin"
      />
      {err && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">{err}</div>}
      {loading && <div className="text-sm text-gray-500 mb-4">Loading...</div>}
      <ul className="space-y-3">
        {list.map(p=> (
          <li key={p.id} className="rounded border p-3 bg-white flex items-start justify-between">
            <div>
              <div className="font-medium">{p.address}</div>
              <div className="text-xs text-gray-500">ID: <span className="font-mono">{p.id}</span> · Deleted: {p.deleted_at ? new Date(p.deleted_at).toLocaleString() : '—'}</div>
            </div>
            <div className="flex gap-2">
              <button className="text-sm rounded border px-3 py-1" onClick={()=>restore(p.id)}>Restore</button>
              <button className="text-sm rounded border px-3 py-1 bg-red-50 text-red-700" onClick={()=>purge(p.id)}>Permanently Delete</button>
            </div>
          </li>
        ))}
      </ul>
      {list.length === 0 && !loading && <div className="text-sm text-gray-500 mt-4">No deleted properties found.</div>}
    </main>
  );
}
