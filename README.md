# Sentra — Offline-First Crisis Damage Reporting Platform

Sentra is a crowdsourced crisis damage reporting web application designed for offline-first resilience. It features a mobile-first, installable Progressive Web Application (PWA) with background sync for community members, and a spatial monitoring dashboard for crisis response administrators.

This project was built as an MVP for a UNDP innovation challenge submission.

---

## 🛠️ Tech Stack & Key Features

*   **Frontend**: React (Vite) + Tailwind CSS + Leaflet.js
*   **PWA**: Service Worker caching, manifest integration, and background sync fallback via `vite-plugin-pwa`
*   **Offline Queue**: IndexedDB storage for text metadata and binary image Blobs (`idb` library)
*   **Backend**: Node.js + Express + Multer (multipart upload handler)
*   **Database**: PostgreSQL with PostGIS extension for proximity versioning, duplicate tracking, and 2km report counts
*   **Translations**: i18next supporting English, Spanish, French, Russian, Chinese, and Arabic
*   **Analytics**: Admin dashboard with Leaflet marker clustering, filters, stats panel, CSV/GeoJSON exports, and historical version toggling.

---

## 🚀 Quick Start with Docker (Recommended)

Spins up the database (with PostGIS), Express backend, and Vite frontend automatically.

1.  **Start Services**:
    ```bash
    docker-compose up --build
    ```
2.  **Seed Demo Data**:
    Once the database is running, seed it with 25-30 realistic Chennai-based reports:
    ```bash
    cd backend
    npm run seed
    ```
3.  **Access the Applications**:
    *   **Public PWA Form**: [http://localhost:3000](http://localhost:3000)
    *   **Admin Dashboard**: [http://localhost:3000](http://localhost:3000) (Click "Admin Portal" in the top right. Password: `admin123`)

---

## 💻 Manual Setup & Local Running

If you are running the database and servers locally on your machine:

### 1. Database Setup
*   Ensure PostgreSQL is installed with the **PostGIS** extension.
*   Create a database named `sentra`.
*   Verify your database credentials in `backend/.env`.

### 2. Backend Setup
```bash
cd backend
npm install
# Copy env and customize if needed
cp .env.example .env 
npm start
```
*The Express server automatically creates the tables and sets up the schema on startup if it detects a clean database.*

### 3. Seed Data
> [!WARNING]
> The database seed script truncates all existing data. It is intended **ONLY** as a local development/demo utility. To execute it:
> 1. Set `ENABLE_SEED_DATA=true` inside `backend/.env`.
> 2. Run the command:
>    ```bash
>    npm run seed
>    ```
> *Do not enable this flag or run this command on production databases.*

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Open [http://localhost:3000](http://localhost:3000) in your browser.*

---

## 🎥 Pitch Video Demo Guide: Testing Offline-to-Online Sync

To demonstrate the offline-sync capabilities in a 2-minute video pitch:

1.  **Open the Web App**: Navigate to the Public Submission Form at [http://localhost:3000](http://localhost:3000).
2.  **Go Offline**:
    *   Open Chrome DevTools (`F12` or Right-click -> Inspect).
    *   Go to the **Network** tab.
    *   Change the throttling dropdown from **No Throttling** to **Offline**.
    *   *(The app will display a yellow banner: "Offline Mode: Reports are stored locally").*
3.  **Fill Out the Form**:
    *   Capture/upload a photo.
    *   Select a damage classification (e.g., *Completely damaged*).
    *   Select some infrastructure types and nature of crisis.
    *   Describe the damage in the text area.
    *   Tap **Use My Current Location** (or drop a pin manually on the map).
4.  **Submit Offline**:
    *   Click **Submit Report**.
    *   An alert will confirm: *"Saved locally — will upload when online"*.
    *   Under DevTools, navigate to **Application** -> **IndexedDB** -> `sentra_db` -> `reports_queue` to show the item queued, including the photo stored as a raw binary Blob.
5.  **Go Online**:
    *   In the Network tab, change the status back to **No Throttling** (Online).
6.  **Verify Auto-Sync**:
    *   The app detects the restoration of network connection.
    *   The Service Worker sync mechanism triggers in the background.
    *   A notification will announce the upload, and **canvas confetti** will celebrate the successful synchronization!
    *   Click the **Admin Portal** button (Password: `admin123`) and verify that your report appears on the map dashboard with correct color coding.
