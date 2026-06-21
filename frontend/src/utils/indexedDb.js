import { openDB } from 'idb';

const DB_NAME = 'sentra_db';
const STORE_NAME = 'reports_queue';
const FOOTPRINTS_STORE = 'footprints_cache';
const DB_VERSION = 2; // Bumped to 2 for footprints_cache

/**
 * Initializes the IndexedDB database
 */
export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(FOOTPRINTS_STORE)) {
        // We'll use the bbox hash (or a string representing the tile/bounds) as the key
        db.createObjectStore(FOOTPRINTS_STORE, { keyPath: 'bboxId' });
      }
    },
  });
}

/**
 * Saves a report form data and photo Blob to the IndexedDB queue
 * @param {Object} reportData - The text fields of the report
 * @param {Blob|File} photoBlob - The binary image data
 */
export async function saveReportOffline(reportData, photoBlob) {
  const db = await initDB();
  const queueItem = {
    ...reportData,
    photoBlob: photoBlob || null,
    submitted_at: new Date().toISOString()
  };
  
  const id = await db.add(STORE_NAME, queueItem);
  console.log(`[IndexedDB] Saved report offline with temporary ID: ${id}`);
  return id;
}

/**
 * Retrieves all pending offline reports from the queue
 */
export async function getOfflineReports() {
  const db = await initDB();
  return db.getAll(STORE_NAME);
}

/**
 * Deletes a report from the offline queue by ID
 * @param {number} id - The IndexedDB primary key
 */
export async function deleteOfflineReport(id) {
  const db = await initDB();
  await db.delete(STORE_NAME, id);
  console.log(`[IndexedDB] Deleted offline report ID: ${id}`);
}

/**
 * Counts how many reports are pending in the offline queue
 */
export async function getOfflineCount() {
  const db = await initDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const count = await tx.objectStore(STORE_NAME).count();
  return count;
}

/**
 * Caches footprint GeoJSON data for offline use
 * @param {string} bboxId - Identifier for the bounding box
 * @param {Object} geojson - The GeoJSON feature collection
 */
export async function saveFootprints(bboxId, geojson) {
  try {
    const db = await initDB();
    await db.put(FOOTPRINTS_STORE, {
      bboxId,
      geojson,
      cached_at: Date.now()
    });
  } catch (err) {
    console.warn('[IndexedDB] Failed to cache footprints:', err);
  }
}

/**
 * Retrieves cached footprints for a bounding box
 * @param {string} bboxId - Identifier for the bounding box
 */
export async function getFootprints(bboxId) {
  try {
    const db = await initDB();
    const result = await db.get(FOOTPRINTS_STORE, bboxId);
    return result ? result.geojson : null;
  } catch (err) {
    console.warn('[IndexedDB] Failed to get cached footprints:', err);
    return null;
  }
}
