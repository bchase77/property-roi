// Sync manager for coordinating online/offline data
import offlineDb from './offlineDb.js';

class SyncManager {
  constructor() {
    this.isOnline = navigator.onLine;
    this.syncInProgress = false;
    this.listeners = [];
    
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners({ type: 'online' });
      this.syncToServer();
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners({ type: 'offline' });
    });
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  notifyListeners(event) {
    this.listeners.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error('Sync listener error:', error);
      }
    });
  }

  async testConnection() {
    try {
      const response = await fetch('/api/version', { 
        cache: 'no-store',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      const wasOnline = this.isOnline;
      this.isOnline = response.ok;
      
      if (wasOnline !== this.isOnline) {
        this.notifyListeners({ type: this.isOnline ? 'online' : 'offline' });
        if (this.isOnline) {
          this.syncToServer();
        }
      }
      
      return this.isOnline;
    } catch (error) {
      const wasOnline = this.isOnline;
      this.isOnline = false;
      
      if (wasOnline !== this.isOnline) {
        this.notifyListeners({ type: 'offline' });
      }
      
      return false;
    }
  }

  async syncToServer() {
    if (this.syncInProgress) return;
    
    this.syncInProgress = true;
    this.notifyListeners({ type: 'syncStart' });

    try {
      const pendingItems = await offlineDb.getPendingSync();
      
      if (pendingItems.length === 0) {
        await this.syncFromServer(); // Still pull latest data
        this.syncInProgress = false;
        this.notifyListeners({ type: 'syncComplete', pendingCount: 0 });
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      for (const item of pendingItems) {
        try {
          await this.syncItem(item);
          await offlineDb.removePendingSync(item.operation, item.data.id);
          successCount++;
        } catch (error) {
          console.error('Failed to sync item:', error);
          errorCount++;
          
          // Increment attempt count
          item.attempts = (item.attempts || 0) + 1;
          if (item.attempts >= 3) {
            console.error('Item failed after 3 attempts, removing from queue:', item);
            await offlineDb.removePendingSync(item.operation, item.data.id);
          }
        }
      }

      // Sync from server to get latest data
      await this.syncFromServer();

      this.notifyListeners({ 
        type: 'syncComplete', 
        pendingCount: pendingItems.length - successCount,
        successCount,
        errorCount 
      });

    } catch (error) {
      console.error('Sync failed:', error);
      this.notifyListeners({ type: 'syncError', error });
    } finally {
      this.syncInProgress = false;
    }
  }

  async syncItem(item) {
    const { operation, data } = item;

    switch (operation) {
      case 'create':
        return await this.syncCreate(data);
      case 'update':
        return await this.syncUpdate(data);
      case 'delete':
        return await this.syncDelete(data);
      default:
        throw new Error(`Unknown sync operation: ${operation}`);
    }
  }

  async syncCreate(property) {
    // Remove temp fields before sending to server
    const serverProperty = { ...property };
    delete serverProperty.isOfflineCreated;
    delete serverProperty.lastModified;
    
    const tempId = serverProperty.id;
    delete serverProperty.id; // Let server assign real ID

    const response = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(serverProperty)
    });

    if (!response.ok) {
      throw new Error(`Failed to create property: ${response.status}`);
    }

    const created = await response.json();
    
    // Update local copy with real ID
    created.lastModified = new Date().toISOString();
    delete created.isOfflineCreated;
    
    // Remove old temp property and save new one
    await this.deleteLocalProperty(tempId);
    await offlineDb.saveProperty(created);
    
    return created;
  }

  async syncUpdate(property) {
    const response = await fetch(`/api/properties/${property.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(property)
    });

    if (!response.ok) {
      throw new Error(`Failed to update property: ${response.status}`);
    }

    const updated = await response.json();
    updated.lastModified = new Date().toISOString();
    await offlineDb.saveProperty(updated);
    
    return updated;
  }

  async syncDelete(data) {
    const response = await fetch(`/api/properties/${data.id}`, {
      method: 'DELETE'
    });

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete property: ${response.status}`);
    }

    return data;
  }

  async syncFromServer() {
    try {
      const response = await fetch('/api/properties', { cache: 'no-store' });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from server: ${response.status}`);
      }

      const serverProperties = await response.json();
      
      // Get local properties to compare
      const localProperties = await offlineDb.getProperties();
      const localById = new Map(localProperties.map(p => [p.id, p]));

      // Update or add server properties to local DB
      const toSave = [];
      
      for (const serverProp of serverProperties) {
        const local = localById.get(serverProp.id);
        
        // Skip if local property is newer (has pending changes)
        if (local?.isOfflineCreated) continue;
        
        serverProp.lastModified = serverProp.lastModified || new Date().toISOString();
        toSave.push(serverProp);
      }

      if (toSave.length > 0) {
        await offlineDb.bulkSaveProperties(toSave);
      }

      // Update last sync timestamp
      await offlineDb.setMetadata('lastSync', new Date().toISOString());
      
    } catch (error) {
      console.error('Failed to sync from server:', error);
      throw error;
    }
  }

  async deleteLocalProperty(propertyId) {
    // Direct IndexedDB deletion without adding to pending sync
    await offlineDb.init();
    
    return new Promise((resolve, reject) => {
      const transaction = offlineDb.db.transaction(['properties'], 'readwrite');
      const store = transaction.objectStore('properties');
      const request = store.delete(propertyId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getProperties() {
    try {
      const localProperties = await offlineDb.getProperties();
      
      // If local cache is empty, try to populate it from server
      if (localProperties.length === 0 && this.isOnline) {
        try {
          console.log('Local cache empty, fetching from server...');
          const response = await fetch('/api/properties', { 
            cache: 'no-store',
            signal: AbortSignal.timeout(15000) // 15 second timeout
          });
          
          if (response.ok) {
            const serverProperties = await response.json();
            console.log(`Fetched ${serverProperties.length} properties from server`);
            
            // Cache for next time
            if (serverProperties.length > 0) {
              await offlineDb.bulkSaveProperties(serverProperties);
              await offlineDb.setMetadata('lastSync', new Date().toISOString());
            }
            
            return serverProperties;
          }
        } catch (networkError) {
          console.error('Initial server fetch failed:', networkError);
          // Continue with empty local cache
        }
      }
      
      // If online and no sync in progress, try to sync in background
      if (this.isOnline && !this.syncInProgress && localProperties.length > 0) {
        // Don't await - let it run in background
        this.testConnection().then(() => {
          if (this.isOnline) {
            this.syncFromServer().catch(console.error);
          }
        });
      }
      
      return localProperties;
    } catch (error) {
      console.error('getProperties failed:', error);
      
      // If local fails and we're online, try server directly as last resort
      if (this.isOnline) {
        try {
          const response = await fetch('/api/properties', { 
            cache: 'no-store',
            signal: AbortSignal.timeout(15000)
          });
          if (response.ok) {
            const properties = await response.json();
            return properties;
          }
        } catch (networkError) {
          console.error('Fallback network request failed:', networkError);
        }
      }
      
      // Return empty array as last resort to prevent crashes
      return [];
    }
  }

  async addProperty(property) {
    if (this.isOnline) {
      try {
        // Try online first
        const response = await fetch('/api/properties', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(property)
        });

        if (response.ok) {
          const created = await response.json();
          // Cache locally
          await offlineDb.saveProperty(created);
          return created;
        }
      } catch (error) {
        console.error('Online creation failed, falling back to offline:', error);
      }
    }

    // Fall back to offline creation
    return await offlineDb.addProperty(property);
  }

  async updateProperty(property) {
    // Always save locally first
    await offlineDb.updateProperty(property);

    if (this.isOnline) {
      try {
        const response = await fetch(`/api/properties/${property.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(property)
        });

        if (response.ok) {
          const updated = await response.json();
          await offlineDb.saveProperty(updated);
          return updated;
        }
      } catch (error) {
        console.error('Online update failed, will sync later:', error);
      }
    }

    return property;
  }

  async deleteProperty(propertyId) {
    await offlineDb.deleteProperty(propertyId);

    if (this.isOnline) {
      try {
        const response = await fetch(`/api/properties/${propertyId}`, {
          method: 'DELETE'
        });

        if (response.ok) {
          return;
        }
      } catch (error) {
        console.error('Online deletion failed, will sync later:', error);
      }
    }
  }

  async getPendingCount() {
    const pending = await offlineDb.getPendingSync();
    return pending.length;
  }

  async getLastSync() {
    return await offlineDb.getMetadata('lastSync');
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      syncInProgress: this.syncInProgress
    };
  }
}

export default new SyncManager();