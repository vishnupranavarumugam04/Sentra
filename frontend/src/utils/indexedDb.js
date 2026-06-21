import { openDB } from 'idb';

const DB_NAME = 'sentra_db';
const STORE_NAME = 'reports_queue';
const DB_VERSION = 1;

/**
 * Initializes the IndexedDB database
 */
export async function initDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
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
