"use client";
import { useEffect, useState } from 'react';
import PageHeader from '@/components/ui/PageHeader';

export default function AdminPage() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  useEffect(() => {
    document.title = 'AD - Admin';
  }, []);

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

  const downloadBackup = async () => {
    if (!confirm('Create a backup of the entire database? This will download a JSON file.')) return;
    setBackupLoading(true);
    setErr('');
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) throw new Error(await res.text());
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setSuccess('Database backup downloaded successfully!');
    } catch (e) {
      console.error(e);
      setErr('Backup failed: ' + e.message);
    } finally {
      setBackupLoading(false);
    }
  };

  const uploadRestore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    if (!confirm('⚠️ RESTORE DATABASE FROM FILE?\n\nThis will COMPLETELY REPLACE all current data with the backup file contents. This action cannot be undone.\n\nAre you absolutely sure?')) {
      event.target.value = ''; // Clear file input
      return;
    }

    setRestoreLoading(true);
    setErr('');
    setSuccess('');
    
    try {
      const text = await file.text();
      const backup = JSON.parse(text);
      
      const res = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(backup)
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      const result = await res.json();
      setSuccess(result.message);
      await load(); // Reload deleted properties list
      
    } catch (e) {
      console.error(e);
      setErr('Restore failed: ' + e.message);
    } finally {
      setRestoreLoading(false);
      event.target.value = ''; // Clear file input
    }
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <PageHeader 
        title="Admin — Database Management"
        subtitle="Manage deleted properties and database backup/restore"
        currentPage="/admin"
      />
      
      {err && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 mb-4">{err}</div>}
      {success && <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 mb-4">{success}</div>}
      {loading && <div className="text-sm text-gray-500 mb-4">Loading...</div>}

      {/* Database Backup/Restore Section */}
      <section className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Database Backup & Restore</h2>
        
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">⚠️ Important Schema Change Warning</h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p><strong>Before making any database schema changes, always create a backup first!</strong></p>
                <p>Schema changes may make old backups incompatible. Save a backup before migrations to ensure you can rollback if needed.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Backup Section */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700">Create Backup</h3>
            <p className="text-sm text-gray-600">Download a complete backup of all database tables (properties, actuals, scenarios) as a JSON file.</p>
            <button
              onClick={downloadBackup}
              disabled={backupLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {backupLoading ? 'Creating Backup...' : '📥 Download Database Backup'}
            </button>
          </div>

          {/* Restore Section */}
          <div className="space-y-3">
            <h3 className="font-medium text-gray-700">Restore from Backup</h3>
            <p className="text-sm text-gray-600">⚠️ This will completely replace all current data with the backup file contents.</p>
            <div className="relative">
              <input
                type="file"
                accept=".json"
                onChange={uploadRestore}
                disabled={restoreLoading}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium py-2 px-4 rounded-md file:mr-4 file:py-1 file:px-2 file:rounded file:border-0 file:text-sm file:font-medium file:bg-red-500 file:text-white hover:file:bg-red-600 transition-colors"
              />
              {restoreLoading && (
                <div className="absolute inset-0 bg-red-600 text-white font-medium py-2 px-4 rounded-md flex items-center justify-center">
                  Restoring Database...
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Deleted Properties Section */}
      <section className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Deleted Properties</h2>
        <ul className="space-y-3">
        {list.map(p=> (
          <li key={p.id} className="rounded border p-3 bg-white flex items-start justify-between text-green-600">
            <div>
              <div className="font-medium">{p.address}</div>
              <div className="text-xs text-gray-500">ID: <span className="font-mono">{p.id}</span> · Deleted: {p.deleted_at ? new Date(p.deleted_at).toLocaleString() : '—'}</div>
            </div>
            <div className="flex gap-2">
              <button className="text-sm rounded border px-3 py-1 text-gray-600" onClick={()=>restore(p.id)}>Restore</button>
              <button className="text-sm rounded border px-3 py-1 bg-red-50 text-red-700" onClick={()=>purge(p.id)}>Permanently Delete</button>
            </div>
          </li>
        ))}
        </ul>
        {list.length === 0 && !loading && <div className="text-sm text-gray-500 mt-4">No deleted properties found.</div>}
      </section>
    </main>
  );
}
