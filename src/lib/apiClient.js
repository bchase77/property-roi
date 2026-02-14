// Unified API client with offline cache fallback
import syncManager from './syncManager.js';
import offlineDb from './offlineDb.js';

class ApiClient {
  constructor() {
    this.syncManager = syncManager;
    this.offlineDb = offlineDb;
  }

  async getProperties() {
    return await this.syncManager.getProperties();
  }

  async getArchivedProperties() {
    try {
      // Try local first
      const localArchived = await this.offlineDb.getArchivedProperties() || [];
      
      // If online, try to sync
      if (this.syncManager.isOnline) {
        try {
          const response = await fetch('/api/properties/archived', { cache: 'no-store' });
          if (response.ok) {
            const serverArchived = await response.json();
            return serverArchived;
          }
        } catch (error) {
          console.error('Failed to fetch archived properties from server:', error);
        }
      }
      
      return localArchived;
    } catch (error) {
      console.error('Failed to get archived properties:', error);
      return [];
    }
  }

  async addProperty(property) {
    return await this.syncManager.addProperty(property);
  }

  async updateProperty(property) {
    return await this.syncManager.updateProperty(property);
  }

  async deleteProperty(propertyId) {
    return await this.syncManager.deleteProperty(propertyId);
  }

  async archiveProperty(propertyId) {
    try {
      // Update locally first
      const properties = await this.getProperties();
      const property = properties.find(p => p.id === propertyId);
      
      if (property) {
        property.archived = true;
        await this.updateProperty(property);
      }

      // Try to archive on server if online
      if (this.syncManager.isOnline) {
        try {
          const response = await fetch(`/api/properties/${propertyId}/archive`, {
            method: 'PUT'
          });

          if (!response.ok) {
            console.error('Server archive failed, will sync later');
          }
        } catch (error) {
          console.error('Archive request failed:', error);
        }
      }

      return property;
    } catch (error) {
      console.error('Failed to archive property:', error);
      throw error;
    }
  }

  async unarchiveProperty(propertyId) {
    try {
      // Update locally first
      const archivedProperties = await this.getArchivedProperties();
      const property = archivedProperties.find(p => p.id === propertyId);
      
      if (property) {
        property.archived = false;
        await this.updateProperty(property);
      }

      // Try to unarchive on server if online
      if (this.syncManager.isOnline) {
        try {
          const response = await fetch(`/api/properties/${propertyId}/unarchive`, {
            method: 'PUT'
          });

          if (!response.ok) {
            console.error('Server unarchive failed, will sync later');
          }
        } catch (error) {
          console.error('Unarchive request failed:', error);
        }
      }

      return property;
    } catch (error) {
      console.error('Failed to unarchive property:', error);
      throw error;
    }
  }

  // Get sync status for UI
  getStatus() {
    return this.syncManager.getStatus();
  }

  async getPendingCount() {
    return await this.syncManager.getPendingCount();
  }

  async getLastSync() {
    return await this.syncManager.getLastSync();
  }

  // Add listener for sync events
  addSyncListener(callback) {
    this.syncManager.addListener(callback);
  }

  removeSyncListener(callback) {
    this.syncManager.removeListener(callback);
  }

  // Force sync
  async forceSync() {
    if (this.syncManager.isOnline) {
      return await this.syncManager.syncToServer();
    } else {
      throw new Error('Cannot sync while offline');
    }
  }

  // Test connection
  async testConnection() {
    return await this.syncManager.testConnection();
  }
}

export default new ApiClient();