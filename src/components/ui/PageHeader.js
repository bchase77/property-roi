'use client';
import { useState, useEffect } from 'react';

export default function PageHeader({ title, subtitle, currentPage }) {
  const [versionString, setVersionString] = useState('Loading...');
  const [connectionStatus, setConnectionStatus] = useState('online');
  const [syncStatus, setSyncStatus] = useState({
    pendingCount: 0,
    lastSync: null,
    syncInProgress: false
  });
  
  useEffect(() => {
    let apiClient = null;
    
    // Dynamically import API client to avoid SSR issues
    const initSync = async () => {
      try {
        const { default: client } = await import('@/lib/apiClient');
        apiClient = client;
        
        // Set up sync listener
        const syncListener = (event) => {
          if (event.type === 'online') {
            setConnectionStatus('online');
          } else if (event.type === 'offline') {
            setConnectionStatus('offline');
          } else if (event.type === 'syncStart') {
            setSyncStatus(prev => ({ ...prev, syncInProgress: true }));
          } else if (event.type === 'syncComplete') {
            setSyncStatus(prev => ({
              ...prev,
              syncInProgress: false,
              pendingCount: event.pendingCount || 0
            }));
          }
        };
        
        apiClient.addSyncListener(syncListener);
        
        // Initial status check
        const updateStatus = async () => {
          try {
            const status = apiClient.getStatus();
            setConnectionStatus(status.isOnline ? 'online' : 'offline');
            
            const pendingCount = await apiClient.getPendingCount();
            const lastSync = await apiClient.getLastSync();
            
            setSyncStatus({
              pendingCount,
              lastSync,
              syncInProgress: status.syncInProgress
            });
            
          } catch (error) {
            console.error('Failed to get sync status:', error);
          }
        };
        
        updateStatus();
        
        // Update status every 30 seconds
        const interval = setInterval(updateStatus, 30000);
        
        return () => {
          if (apiClient) {
            apiClient.removeSyncListener(syncListener);
          }
          clearInterval(interval);
        };
        
      } catch (error) {
        console.error('Failed to initialize sync:', error);
      }
    };

    // Get the current git hash if available
    const getGitInfo = async () => {
      try {
        // Try to get current git info
        const response = await fetch('/api/version', { cache: 'no-store' });
        if (response.ok) {
          const data = await response.json();
          setVersionString(data.version);
          if (!apiClient) setConnectionStatus('online');
        } else {
          throw new Error('API not available');
        }
      } catch {
        if (!apiClient) setConnectionStatus('offline');
        // Fallback to static version info
        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
          month: '2-digit',
          day: '2-digit', 
          year: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit'
        });
        
        setVersionString(`v0.1.0 ${dateStr} ${timeStr}`);
      }
    };
    
    getGitInfo();
    const cleanup = initSync();
    
    return () => {
      cleanup.then(fn => fn && fn());
    };
  }, []);

  const pages = [
    { name: 'Dashboard', path: '/dashboard', icon: '🏠' },
    { name: 'Portfolio', path: '/portfolio', icon: '📊' },
    { name: 'Analysis', path: '/analysis', icon: '📈' },
    { name: 'Groups', path: '/groups', icon: '📋' },
    { name: 'Comparison', path: '/comparison', icon: '⚖️' },
    { name: 'Data Entry', path: '/data-entry', icon: '✏️' },
    { name: 'Bulk Lookup', path: '/bulk-lookup', icon: '🔍' },
    { name: 'Archive', path: '/archive', icon: '📁' },
    { name: 'Admin', path: '/admin', icon: '⚙️' }
  ];

  const openInNewTab = (path) => {
    window.open(path, '_blank');
  };

  return (
    <header className="flex justify-between items-start mb-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
  {subtitle && <p className="text-gray-200">{subtitle}</p>}
      </div>
      
      <div className="text-right">
        {/* Version Number and Connection Status */}
        <div className="flex items-center justify-end gap-2 text-sm text-gray-500 font-mono mb-3">
          <span>{versionString}</span>
          
          {/* Offline/Sync Status */}
          {connectionStatus === 'offline' && (
            <div className="flex items-center gap-1 text-xs">
              <span className="text-orange-500" title="Connection may be spotty">📶❌</span>
              {syncStatus.pendingCount > 0 && (
                <span className="text-blue-500" title={`${syncStatus.pendingCount} changes pending sync`}>
                  📤{syncStatus.pendingCount}
                </span>
              )}
            </div>
          )}
          
          {connectionStatus === 'online' && syncStatus.syncInProgress && (
            <span className="text-blue-500 text-xs animate-pulse" title="Syncing changes...">
              🔄
            </span>
          )}
          
          {connectionStatus === 'online' && syncStatus.pendingCount > 0 && !syncStatus.syncInProgress && (
            <span className="text-blue-500 text-xs" title={`${syncStatus.pendingCount} changes pending sync`}>
              📤{syncStatus.pendingCount}
            </span>
          )}
        </div>
        
        {/* Navigation Buttons */}
        <div className="flex flex-wrap gap-2">
          {pages.map((page) => (
            <button
              key={page.path}
              onClick={() => openInNewTab(page.path)}
              disabled={currentPage === page.path}
              className={`px-3 py-1 text-xs rounded border flex items-center gap-1 ${
                currentPage === page.path
                  ? 'bg-blue-100 text-blue-800 border-blue-300 cursor-not-allowed'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
              title={`Open ${page.name} in new tab`}
            >
              <span>{page.icon}</span>
              <span>{page.name}</span>
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}