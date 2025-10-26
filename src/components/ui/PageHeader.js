'use client';
import { useState, useEffect } from 'react';

export default function PageHeader({ title, subtitle, currentPage }) {
  const [versionString, setVersionString] = useState('Loading...');
  
  useEffect(() => {
    const gitHash = process.env.GIT_HASH || 'unknown';
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    });
    const timeStr = now.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
    setVersionString(`${gitHash} ${dateStr} ${timeStr}`);
  }, []);

  const pages = [
    { name: 'Dashboard', path: '/dashboard', icon: '🏠' },
    { name: 'Portfolio', path: '/portfolio', icon: '📊' },
    { name: 'Analysis', path: '/analysis', icon: '📈' },
    { name: 'Data Entry', path: '/data-entry', icon: '✏️' },
    { name: 'Admin', path: '/admin', icon: '⚙️' }
  ];

  const openInNewTab = (path) => {
    window.open(path, '_blank');
  };

  return (
    <header className="flex justify-between items-start mb-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{title}</h1>
        {subtitle && <p className="text-gray-600">{subtitle}</p>}
      </div>
      
      <div className="text-right">
        {/* Version Number */}
        <div className="text-sm text-gray-500 font-mono mb-3">{versionString}</div>
        
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