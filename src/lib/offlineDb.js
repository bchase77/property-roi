// IndexedDB wrapper for offline property storage
const DB_NAME = 'PropertyROI';
const DB_VERSION = 1;
const PROPERTIES_STORE = 'properties';
const PENDING_SYNC_STORE = 'pendingSync';
const METADATA_STORE = 'metadata';

class OfflineDB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Properties store
        if (!db.objectStoreNames.contains(PROPERTIES_STORE)) {
          const propertiesStore = db.createObjectStore(PROPERTIES_STORE, { keyPath: 'id', autoIncrement: true });
          propertiesStore.createIndex('address', 'address', { unique: false });
          propertiesStore.createIndex('purchased', 'purchased', { unique: false });
          propertiesStore.createIndex('archived', 'archived', { unique: false });
        }

        // Pending sync operations store
        if (!db.objectStoreNames.contains(PENDING_SYNC_STORE)) {
          const pendingStore = db.createObjectStore(PENDING_SYNC_STORE, { keyPath: 'id', autoIncrement: true });
          pendingStore.createIndex('operation', 'operation', { unique: false });
          pendingStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Metadata store (last sync, etc.)
        if (!db.objectStoreNames.contains(METADATA_STORE)) {
          db.createObjectStore(METADATA_STORE, { keyPath: 'key' });
        }
      };
    });
  }

  async getProperties() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PROPERTIES_STORE], 'readonly');
      const store = transaction.objectStore(PROPERTIES_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        // Filter out archived properties (unless specifically requested)
        const properties = request.result.filter(p => !p.archived);
        resolve(properties);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async getArchivedProperties() {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PROPERTIES_STORE], 'readonly');
      const store = transaction.objectStore(PROPERTIES_STORE);
      const index = store.index('archived');
      const request = index.getAll(true);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async saveProperty(property) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PROPERTIES_STORE], 'readwrite');
      const store = transaction.objectStore(PROPERTIES_STORE);
      
      // Add timestamp for tracking
      property.lastModified = new Date().toISOString();
      
      const request = store.put(property);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async addProperty(property) {
    if (!this.db) await this.init();

    // Generate temporary ID for offline creation
    const tempId = 'temp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    property.id = tempId;
    property.isOfflineCreated = true;
    property.lastModified = new Date().toISOString();

    await this.saveProperty(property);
    await this.addPendingSync('create', property);
    
    return property;
  }

  async updateProperty(property) {
    if (!this.db) await this.init();

    property.lastModified = new Date().toISOString();
    await this.saveProperty(property);
    
    // Only add to pending if it's not an offline-created property (those are already in pending)
    if (!property.isOfflineCreated) {
      await this.addPendingSync('update', property);
    }
    
    return property;
  }

  async deleteProperty(propertyId) {
    if (!this.db) await this.init();

    return new Promise(async (resolve, reject) => {
      const transaction = this.db.transaction([PROPERTIES_STORE], 'readwrite');
      const store = transaction.objectStore(PROPERTIES_STORE);
      
      // Get the property first to check if it's offline-created
      const getRequest = store.get(propertyId);
      
      getRequest.onsuccess = async () => {
        const property = getRequest.result;
        
        if (property?.isOfflineCreated) {
          // If offline-created, just remove it locally and from pending sync
          await this.removePendingSync('create', propertyId);
          const deleteRequest = store.delete(propertyId);
          deleteRequest.onsuccess = () => resolve();
          deleteRequest.onerror = () => reject(deleteRequest.error);
        } else {
          // If synced property, mark for deletion and add to pending
          const deleteRequest = store.delete(propertyId);
          deleteRequest.onsuccess = async () => {
            await this.addPendingSync('delete', { id: propertyId });
            resolve();
          };
          deleteRequest.onerror = () => reject(deleteRequest.error);
        }
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async addPendingSync(operation, data) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PENDING_SYNC_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_SYNC_STORE);
      
      const syncItem = {
        operation, // 'create', 'update', 'delete'
        data,
        timestamp: new Date().toISOString(),
        attempts: 0
      };

      const request = store.add(syncItem);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingSync() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PENDING_SYNC_STORE], 'readonly');
      const store = transaction.objectStore(PENDING_SYNC_STORE);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async removePendingSync(operation, itemId) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PENDING_SYNC_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_SYNC_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const items = request.result;
        const toRemove = items.filter(item => 
          item.operation === operation && 
          (item.data.id === itemId || item.data.id?.toString() === itemId?.toString())
        );

        let completed = 0;
        if (toRemove.length === 0) {
          resolve();
          return;
        }

        toRemove.forEach(item => {
          const deleteTransaction = this.db.transaction([PENDING_SYNC_STORE], 'readwrite');
          const deleteStore = deleteTransaction.objectStore(PENDING_SYNC_STORE);
          const deleteRequest = deleteStore.delete(item.id);
          
          deleteRequest.onsuccess = () => {
            completed++;
            if (completed === toRemove.length) resolve();
          };
          deleteRequest.onerror = () => reject(deleteRequest.error);
        });
      };
      request.onerror = () => reject(request.error);
    });
  }

  async clearPendingSync() {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PENDING_SYNC_STORE], 'readwrite');
      const store = transaction.objectStore(PENDING_SYNC_STORE);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async setMetadata(key, value) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([METADATA_STORE], 'readwrite');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.put({ key, value, timestamp: new Date().toISOString() });

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMetadata(key) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([METADATA_STORE], 'readonly');
      const store = transaction.objectStore(METADATA_STORE);
      const request = store.get(key);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  async bulkSaveProperties(properties) {
    if (!this.db) await this.init();

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([PROPERTIES_STORE], 'readwrite');
      const store = transaction.objectStore(PROPERTIES_STORE);
      
      let completed = 0;
      const total = properties.length;

      if (total === 0) {
        resolve();
        return;
      }

      properties.forEach(property => {
        property.lastModified = property.lastModified || new Date().toISOString();
        const request = store.put(property);
        
        request.onsuccess = () => {
          completed++;
          if (completed === total) resolve();
        };
        request.onerror = () => reject(request.error);
      });
    });
  }
}

export default new OfflineDB();