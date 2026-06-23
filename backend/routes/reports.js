const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createObjectCsvStringifier } = require('csv-writer');
const db = require('../db');
const { classifyDamage } = require('../services/aiClassifier');
const { updateReporterScore, checkRateLimit } = require('../services/scorer');

const inMemoryReports = [];

// Helper to generate device fingerprint
const getDeviceFingerprint = (req) => {
  const ua = req.headers['user-agent'] || '';
  const lang = req.headers['accept-language'] || '';
  const ip = req.ip || '';
  return crypto.createHash('sha256').update(`${ip}-${ua}-${lang}`).digest('hex');
};

// Rate limiter middleware (now DB-backed)
const rateLimiter = async (req, res, next) => {
  const fingerprint = getDeviceFingerprint(req);
  req.deviceFingerprint = fingerprint; // Attach for later use
  
  const isSpam = await checkRateLimit(fingerprint);
  if (isSpam) {
    return res.status(429).json({
      error: 'Submission limit reached. Please wait before reporting again.'
    });
  }
  next();
};

// Configure Multer storage for uploaded photos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * LibreTranslate Helper
 */
async function translateDescription(description, fromLang) {
  const translateUrl = process.env.LIBRETRANSLATE_URL;
  if (!translateUrl || !description || fromLang === 'en') {
    return description; // Fallback to original
  }
  
  try {
    const url = `${translateUrl.replace(/\/$/, '')}/translate`;
    console.log(`[LibreTranslate] Translating from ${fromLang} to en: "${description}"`);
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        q: description,
        source: fromLang,
        target: 'en',
        format: 'text'
      }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data && data.translatedText) {
        return data.translatedText;
      }
    }
  } catch (error) {
    console.warn('[LibreTranslate] Translation failed:', error.message);
  }
  return description; // Fallback to original description
}

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Submit a new crisis report
 *     description: Submit a new damage assessment report with an optional photo.
 *     tags: [Reports]
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               photo:
 *                 type: string
 *                 format: binary
 *               damage_level:
 *                 type: string
 *               infrastructure_type:
 *                 type: string
 *               crisis_type:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       201:
 *         description: Report successfully created
 *       400:
 *         description: Missing required fields
 *       429:
 *         description: Rate limit exceeded
 */
router.post('/', rateLimiter, upload.single('photo'), async (req, res) => {
  try {
    const {
      damage_level,
      infrastructure_type,
      infrastructure_details,
      crisis_type,
      has_debris,
      description,
      latitude,
      longitude,
      landmark_description,
      language,
      ai_suggested_level,
      ai_confidence,
      source
    } = req.body;

    // 1. Basic validation
    if (!damage_level || !infrastructure_type || !crisis_type || !latitude || !longitude) {
      return res.status(400).json({ error: 'Missing required report fields.' });
    }

    const latVal = parseFloat(latitude);
    const lngVal = parseFloat(longitude);
    if (isNaN(latVal) || isNaN(lngVal)) {
      return res.status(400).json({ error: 'Invalid coordinates.' });
    }

    const validDamageLevels = ['Minimal/No damage', 'Partially damaged', 'Completely damaged'];
    if (!validDamageLevels.includes(damage_level)) {
      return res.status(400).json({ error: 'Invalid damage level.' });
    }

    // Parse array inputs (frontend may send JSON-stringified arrays or simple arrays)
    let parsedInfra = [];
    try {
      parsedInfra = typeof infrastructure_type === 'string' ? JSON.parse(infrastructure_type) : infrastructure_type;
    } catch {
      parsedInfra = [infrastructure_type];
    }

    let parsedCrisis = [];
    try {
      parsedCrisis = typeof crisis_type === 'string' ? JSON.parse(crisis_type) : crisis_type;
    } catch {
      parsedCrisis = [crisis_type];
    }

    const debrisBool = has_debris === 'true' || has_debris === true;
    const reportLanguage = language || 'en';
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // 2. AI damage classifier invocation (stub)
    if (req.file) {
      const absolutePath = path.join(__dirname, '../uploads', req.file.filename);
      await classifyDamage(absolutePath);
    }

    // 3. LibreTranslate translation
    const descriptionTranslated = await translateDescription(description, reportLanguage);

    // 3b. Detect PostGIS availability once per server lifetime (cached on router object)
    if (typeof router._postgisAvailable === 'undefined') {
      try {
        await db.query('SELECT ST_MakePoint(0,0)');
        router._postgisAvailable = true;
        console.log('[DB] PostGIS detected — spatial queries enabled.');
      } catch {
        router._postgisAvailable = false;
        console.warn('[DB] PostGIS not available — using plain-SQL fallbacks.');
      }
    }
    const postgisOk = router._postgisAvailable;

    // 4. Location Versioning logic
    let locationGroupId;
    let isLatest = true;
    let hasExistingGroup = false;

    if (postgisOk) {
      try {
        const verRes = await db.query(`
          SELECT location_group_id,
                 ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance
          FROM reports
          WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 50)
          ORDER BY distance ASC LIMIT 1
        `, [lngVal, latVal]);
        if (verRes.rows.length > 0) {
          locationGroupId = verRes.rows[0].location_group_id;
          hasExistingGroup = true;
        }
      } catch (e) {
        console.warn('[DB] PostGIS version-check failed:', e.message);
      }
    } else {
      try {
        // ~0.0005 degrees ≈ 55 metres
        const verRes = await db.query(`
          SELECT location_group_id FROM reports
          WHERE ABS(latitude - $1) < 0.0005 AND ABS(longitude - $2) < 0.0005
          ORDER BY submitted_at DESC LIMIT 1
        `, [latVal, lngVal]);
        if (verRes.rows.length > 0) {
          locationGroupId = verRes.rows[0].location_group_id;
          hasExistingGroup = true;
        }
      } catch (e) {
        console.warn('[DB] Plain version-check failed:', e.message);
      }
    }

    if (!locationGroupId) locationGroupId = crypto.randomUUID();

    // 5. Duplicate Detection
    let possibleDuplicate = false;
    if (hasExistingGroup) {
      try {
        const dupRes = await db.query(`
          SELECT id FROM reports
          WHERE location_group_id = $1
            AND damage_level = $2
            AND submitted_at >= NOW() - INTERVAL '5 minutes'
          LIMIT 1
        `, [locationGroupId, damage_level]);
        if (dupRes.rows.length > 0) {
          possibleDuplicate = true;
          console.log(`[Duplicate Alert] Potential duplicate detected for group ${locationGroupId}`);
        }
      } catch (e) {
        console.warn('[DB] Duplicate check failed:', e.message);
      }
    }

    // Update older records in this group as is_latest = false if NOT a duplicate
    if (hasExistingGroup) {
      if (possibleDuplicate) {
        isLatest = false;
      } else {
        try {
          await db.query(`UPDATE reports SET is_latest = false WHERE location_group_id = $1`, [locationGroupId]);
        } catch (e) {
          console.warn('[DB] is_latest update failed:', e.message);
        }
      }
    }

    // 6. Save Report — PostGIS INSERT (with geom) or plain INSERT (without geom)
    let newReport = {
      id: 'local-fallback-id-' + Date.now(),
      photo_url: photoUrl,
      damage_level,
      infrastructure_type: parsedInfra,
      infrastructure_details: infrastructure_details || '',
      crisis_type: parsedCrisis,
      has_debris: debrisBool,
      description: description || '',
      description_translated: descriptionTranslated || description || '',
      latitude: latVal,
      longitude: lngVal,
      landmark_description: landmark_description || '',
      location_group_id: locationGroupId,
      is_latest: isLatest,
      possible_duplicate: possibleDuplicate,
      language: reportLanguage,
      ai_suggested_level: ai_suggested_level || null,
      ai_confidence: ai_confidence ? parseInt(ai_confidence) : null,
      source: source || 'web',
      submitted_at: new Date()
    };

    try {
      let saveRes;
      if (postgisOk) {
        saveRes = await db.query(`
          INSERT INTO reports (
            photo_url, damage_level, infrastructure_type, infrastructure_details,
            crisis_type, has_debris, description, description_translated,
            latitude, longitude, geom, landmark_description, location_group_id,
            is_latest, possible_duplicate, language, ai_suggested_level, ai_confidence, source
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            ST_SetSRID(ST_MakePoint($10, $9), 4326),
            $11, $12, $13, $14, $15, $16, $17, $18
          ) RETURNING *
        `, [
          photoUrl, damage_level, parsedInfra, infrastructure_details || '',
          parsedCrisis, debrisBool, description || '', descriptionTranslated || description || '',
          latVal, lngVal, landmark_description || '', locationGroupId,
          isLatest, possibleDuplicate, reportLanguage,
          ai_suggested_level || null, ai_confidence ? parseInt(ai_confidence) : null, source || 'web'
        ]);
      } else {
        // Plain INSERT — no geom column (table must have been created without PostGIS)
        saveRes = await db.query(`
          INSERT INTO reports (
            photo_url, damage_level, infrastructure_type, infrastructure_details,
            crisis_type, has_debris, description, description_translated,
            latitude, longitude, landmark_description, location_group_id,
            is_latest, possible_duplicate, language, ai_suggested_level, ai_confidence, source
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          ) RETURNING *
        `, [
          photoUrl, damage_level, parsedInfra, infrastructure_details || '',
          parsedCrisis, debrisBool, description || '', descriptionTranslated || description || '',
          latVal, lngVal, landmark_description || '', locationGroupId,
          isLatest, possibleDuplicate, reportLanguage,
          ai_suggested_level || null, ai_confidence ? parseInt(ai_confidence) : null, source || 'web'
        ]);
      }
      if (saveRes && saveRes.rows.length > 0) {
        newReport = saveRes.rows[0];
      }
    } catch (dbError) {
      console.warn('[DB Fallback] Could not save report to database (DB down). Returning success anyway to UI.', dbError.message);
      inMemoryReports.unshift(newReport);
    }

    // --- 7. Update Reporter Score (Gamification) ---
    const scoreResult = await updateReporterScore(req.deviceFingerprint, newReport);

    // 8. Non-monetary Engagement: count reports in ~2km radius
    let nearbyCount = 1;
    try {
      if (postgisOk) {
        const countRes = await db.query(`
          SELECT COUNT(*)::int as count FROM reports
          WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 2000)
        `, [lngVal, latVal]);
        nearbyCount = countRes.rows[0].count;
      } else {
        // ~0.018 degrees ≈ 2 km
        const countRes = await db.query(`
          SELECT COUNT(*)::int as count FROM reports
          WHERE ABS(latitude - $1) < 0.018 AND ABS(longitude - $2) < 0.018
        `, [latVal, lngVal]);
        nearbyCount = countRes.rows[0].count;
      }
    } catch (e) {
      console.warn('[DB] Nearby count failed:', e.message);
    }

    return res.status(201).json({
      success: true,
      report: newReport,
      nearby_count: nearbyCount,
      gamification: scoreResult // Return new score/rank to frontend
    });

  } catch (error) {
    console.error('Error creating report:', error);
    return res.status(500).json({ error: 'Server error while submitting report.' });
  }
});

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Retrieve crisis reports
 *     description: Returns reports as a GeoJSON FeatureCollection. Supports filtering.
 *     tags: [Reports]
 *     parameters:
 *       - in: query
 *         name: damage_level
 *         schema:
 *           type: string
 *         description: Filter by damage level
 *     responses:
 *       200:
 *         description: A GeoJSON FeatureCollection of reports
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   example: FeatureCollection
 *                 features:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/', async (req, res) => {
  try {
    const { damage_level, infrastructure_type, crisis_type } = req.query;

    let queries = [];
    let params = [];
    let paramIndex = 1;

    // Filter build
    if (damage_level) {
      queries.push(`damage_level = $${paramIndex++}`);
      params.push(damage_level);
    }
    if (infrastructure_type) {
      queries.push(`$${paramIndex++} = ANY(infrastructure_type)`);
      params.push(infrastructure_type);
    }
    if (crisis_type) {
      queries.push(`$${paramIndex++} = ANY(crisis_type)`);
      params.push(crisis_type);
    }

    const whereClause = queries.length > 0 ? `WHERE ${queries.join(' AND ')}` : '';
    const selectQuery = `SELECT * FROM reports ${whereClause} ORDER BY submitted_at DESC`;
    
    let rows = [];
    try {
      const dbRes = await db.query(selectQuery, params);
      rows = [...inMemoryReports, ...dbRes.rows];
    } catch (dbError) {
      console.warn('[DB Fallback] Could not fetch reports from database. Serving in-memory fallback.', dbError.message);
      rows = inMemoryReports;
    }

    // Formulate GeoJSON
    const featureCollection = {
      type: 'FeatureCollection',
      features: rows.map(row => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [row.longitude, row.latitude]
        },
        properties: {
          id: row.id,
          photo_url: row.photo_url,
          damage_level: row.damage_level,
          infrastructure_type: row.infrastructure_type,
          infrastructure_details: row.infrastructure_details,
          crisis_type: row.crisis_type,
          has_debris: row.has_debris,
          description: row.description,
          description_translated: row.description_translated,
          latitude: row.latitude,
          longitude: row.longitude,
          landmark_description: row.landmark_description,
          location_group_id: row.location_group_id,
          is_latest: row.is_latest,
          possible_duplicate: row.possible_duplicate,
          submitted_at: row.submitted_at,
          language: row.language
        }
      }))
    };

    return res.json(featureCollection);
  } catch (error) {
    console.error('Error fetching reports:', error);
    return res.status(500).json({ error: 'Server error while fetching reports.' });
  }
});

/**
 * GET /api/reports/export/csv
 * Exports all reports as a downloadable CSV
 */
router.get('/export/csv', async (req, res) => {
  try {
    let rows = [];
    try {
      const dbRes = await db.query('SELECT * FROM reports ORDER BY submitted_at DESC');
      rows = [...inMemoryReports, ...dbRes.rows];
    } catch (dbError) {
      console.warn('[DB Fallback] Could not fetch reports for CSV export. Serving in-memory fallback.', dbError.message);
      rows = inMemoryReports;
    }
    
    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id', title: 'ID' },
        { id: 'submitted_at', title: 'Submitted At' },
        { id: 'damage_level', title: 'Damage Level' },
        { id: 'infrastructure_type', title: 'Infrastructure Type' },
        { id: 'infrastructure_details', title: 'Infrastructure Details' },
        { id: 'crisis_type', title: 'Crisis Type' },
        { id: 'has_debris', title: 'Has Debris' },
        { id: 'description', title: 'Description' },
        { id: 'description_translated', title: 'Description Translated' },
        { id: 'latitude', title: 'Latitude' },
        { id: 'longitude', title: 'Longitude' },
        { id: 'landmark_description', title: 'Landmark Description' },
        { id: 'location_group_id', title: 'Location Group ID' },
        { id: 'is_latest', title: 'Is Latest' },
        { id: 'possible_duplicate', title: 'Possible Duplicate' },
        { id: 'language', title: 'Language' },
        { id: 'photo_url', title: 'Photo URL' }
      ]
    });

    const header = csvStringifier.getHeaderString();
    // Prepare arrays as comma-separated string for CSV formatting
    const formattedRows = rows.map(row => {
      const infra = Array.isArray(row.infrastructure_type) 
        ? row.infrastructure_type.join(', ') 
        : (row.infrastructure_type || '');
      const crisis = Array.isArray(row.crisis_type) 
        ? row.crisis_type.join(', ') 
        : (row.crisis_type || '');
      const submitted = row.submitted_at instanceof Date 
        ? row.submitted_at.toISOString() 
        : (row.submitted_at ? new Date(row.submitted_at).toISOString() : new Date().toISOString());

      return {
        ...row,
        infrastructure_type: infra,
        crisis_type: crisis,
        submitted_at: submitted
      };
    });
    
    const body = csvStringifier.stringifyRecords(formattedRows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=sentra_reports.csv');
    return res.send(header + body);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    return res.status(500).json({ error: 'Server error while exporting CSV.' });
  }
});

/**
 * GET /api/reports/export/geojson
 * Exports all reports as a downloadable GeoJSON file
 */
router.get('/export/geojson', async (req, res) => {
  try {
    let rows = [];
    try {
      const dbRes = await db.query('SELECT * FROM reports ORDER BY submitted_at DESC');
      rows = [...inMemoryReports, ...dbRes.rows];
    } catch (dbError) {
      console.warn('[DB Fallback] Could not fetch reports for GeoJSON export. Serving in-memory fallback.', dbError.message);
      rows = inMemoryReports;
    }
    
    const geojson = {
      type: 'FeatureCollection',
      features: rows.map(row => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [row.longitude, row.latitude]
        },
        properties: {
          id: row.id,
          photo_url: row.photo_url,
          damage_level: row.damage_level,
          infrastructure_type: row.infrastructure_type,
          infrastructure_details: row.infrastructure_details,
          crisis_type: row.crisis_type,
          has_debris: row.has_debris,
          description: row.description,
          description_translated: row.description_translated,
          latitude: row.latitude,
          longitude: row.longitude,
          landmark_description: row.landmark_description,
          location_group_id: row.location_group_id,
          is_latest: row.is_latest,
          possible_duplicate: row.possible_duplicate,
          submitted_at: row.submitted_at,
          language: row.language
        }
      }))
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=sentra_reports.geojson');
    return res.send(JSON.stringify(geojson, null, 2));
  } catch (error) {
    console.error('Error exporting GeoJSON:', error);
    return res.status(500).json({ error: 'Server error while exporting GeoJSON.' });
  }
});

/**
 * DELETE /api/reports/:id
 * Deletes a report
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let report = null;
    let foundInDb = false;

    // 1. Try to find the report in the PostgreSQL database
    try {
      const checkRes = await db.query('SELECT * FROM reports WHERE id = $1', [id]);
      if (checkRes.rows.length > 0) {
        report = checkRes.rows[0];
        foundInDb = true;
      }
    } catch (dbError) {
      console.warn('[DB Fallback] Failed to query report from DB (using in-memory fallback):', dbError.message);
    }

    // 2. If not found in DB or database query failed, check the in-memory array fallback
    const inMemIndex = inMemoryReports.findIndex(r => String(r.id) === String(id));
    if (inMemIndex !== -1) {
      if (!report) {
        report = inMemoryReports[inMemIndex];
      }
      inMemoryReports.splice(inMemIndex, 1);
    }

    // 3. If report is not found in database nor in-memory list, return 404
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // 4. Optionally delete the image file from the local filesystem uploads folder
    if (report.photo_url) {
      try {
        const filePath = path.join(__dirname, '..', report.photo_url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (fileError) {
        console.warn('[File System] Failed to delete photo file:', fileError.message);
      }
    }

    // 5. If found in DB, delete it from the DB
    if (foundInDb) {
      try {
        await db.query('DELETE FROM reports WHERE id = $1', [id]);
      } catch (dbError) {
        console.warn('[DB Fallback] Failed to execute DELETE query in DB:', dbError.message);
        return res.status(500).json({ error: 'Failed to delete report from database: ' + dbError.message });
      }
    }

    return res.json({ success: true, message: 'Report resolved and removed.' });
  } catch (error) {
    console.error('Error deleting report:', error);
    return res.status(500).json({ error: 'Server error while deleting report.' });
  }
});

module.exports = router;
