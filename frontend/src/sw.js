import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';

// Precache Vite-bundled assets
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// Cache page navigations
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: 'pages-cache'
  })
);

// Cache Leaflet CSS/JS assets and OpenStreetMap tiles offline
registerRoute(
  ({ url }) => 
    url.hostname.includes('tile.openstreetmap.org') || 
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com'),
  new StaleWhileRevalidate({
    cacheName: 'assets-and-tiles-cache'
  })
);

// Self-contained Raw IndexedDB Helpers (no bundler imports needed)
function getOfflineReportsRaw() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sentra_db', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('reports_queue')) {
        return resolve([]);
      }
      const tx = db.transaction('reports_queue', 'readonly');
      const store = tx.objectStore('reports_queue');
      const getReq = store.getAll();
      getReq.onsuccess = () => resolve(getReq.result);
      getReq.onerror = () => reject(getReq.error);
    };
  });
}

function deleteOfflineReportRaw(id) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sentra_db', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('reports_queue', 'readwrite');
      const store = tx.objectStore('reports_queue');
      const delReq = store.delete(id);
      delReq.onsuccess = () => resolve();
      delReq.onerror = () => reject(delReq.error);
    };
  });
}

/**
 * Sync offline-saved reports to backend
 */
async function syncOfflineReports() {
  try {
    const reports = await getOfflineReportsRaw();
    if (reports.length === 0) return;
    
    console.log(`[Service Worker] Syncing ${reports.length} pending offline reports...`);
    let syncSuccessCount = 0;

    for (const report of reports) {
      const formData = new FormData();
      formData.append('damage_level', report.damage_level);
      formData.append('infrastructure_type', JSON.stringify(report.infrastructure_type));
      formData.append('infrastructure_details', report.infrastructure_details || '');
      formData.append('crisis_type', JSON.stringify(report.crisis_type));
      formData.append('has_debris', report.has_debris);
      formData.append('description', report.description || '');
      formData.append('latitude', report.latitude);
      formData.append('longitude', report.longitude);
      formData.append('landmark_description', report.landmark_description || '');
      formData.append('language', report.language || 'en');

      if (report.photoBlob) {
        formData.append('photo', report.photoBlob, 'capture.jpg');
      }

      // In local dev, proxy maps /api to backend, else fallback to host origin
      const response = await fetch('/api/reports', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        console.log(`[Service Worker] Synced report ID: ${report.id}`);
        await deleteOfflineReportRaw(report.id);
        syncSuccessCount++;
      } else {
        console.warn(`[Service Worker] Failed to sync report ID ${report.id}: Status ${response.status}`);
      }
    }

    if (syncSuccessCount > 0) {
      // Notify active frontend clients that sync completed
      const channel = new BroadcastChannel('sentra_sync_channel');
      channel.postMessage({ type: 'SYNC_COMPLETE', count: syncSuccessCount });
    }
  } catch (error) {
    console.error('[Service Worker] Sync execution failed:', error);
  }
}

// Background Sync API listener
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reports') {
    console.log('[Service Worker] Sync event triggered');
    event.waitUntil(syncOfflineReports());
  }
});

// Periodic fallback sync or push event sync
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'TRIGGER_SYNC') {
    console.log('[Service Worker] Sync manual trigger received');
    event.waitUntil(syncOfflineReports());
  }
});
