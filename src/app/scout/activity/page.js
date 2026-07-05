'use client';
import { useState, useEffect } from 'react';
import PageHeader from '@/components/ui/PageHeader';

function timeAgo(iso) {
  const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function ActivityPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch('/api/scout/activity')
      .then(r => r.json())
      .then(rows => { setEntries(rows); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="flex items-center justify-between mb-4">
        <PageHeader title="Activity" subtitle="Recent Scout DB updates" currentPage="/scout/activity" dark />
        <div className="flex gap-3 items-center">
          <button
            onClick={load}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg"
          >
            Refresh
          </button>
          <a href="/scout" className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg">
            ← Scout
          </a>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-500 text-sm">No activity yet.</p>
      ) : (
        <div className="max-w-2xl">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-gray-800">
              {entries.map(e => (
                <tr key={e.id} className="hover:bg-gray-800/50">
                  <td className="py-2 pr-6 text-gray-200">{e.message}</td>
                  <td className="py-2 text-gray-500 text-xs whitespace-nowrap text-right" title={new Date(e.created_at).toLocaleString()}>
                    {timeAgo(e.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
