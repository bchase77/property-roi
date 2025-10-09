'use client';
import { useState, useEffect } from 'react';

export default function PageHeader({ title, subtitle, currentPage }) {
  const [versionString, setVersionString] = useState('v1.0.loading');
  
  // Generate version string with current date/time (client-side only to avoid hydration issues)
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hour = String(now.getHours()).padStart(2, '0');
    const minute = String(now.getMinutes()).padStart(2, '0');
    setVersionString(`v1.0.${year}${month}${day}${hour}${minute}`);
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