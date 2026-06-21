const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { createObjectCsvStringifier } = require('csv-writer');
const db = require('../db');
const { classifyDamage } = require('../services/aiClassifier');

// Simple memory-based rate limiter to prevent spamming submissions (max 15 per hour per IP)
const submissionRateLimits = {};
const rateLimiter = (req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const limitWindow = 60 * 60 * 1000; // 1 hour
  const maxLimit = 15;

  if (!submissionRateLimits[ip]) {
    submissionRateLimits[ip] = [];
  }

  // Filter older timestamps out of window
  submissionRateLimits[ip] = submissionRateLimits[ip].filter(time => now - time < limitWindow);

  if (submissionRateLimits[ip].length >= maxLimit) {
    return res.status(429).json({
      error: 'Too many reports submitted from this device. Please try again in an hour.'
    });
  }

  submissionRateLimits[ip].push(now);
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
 * POST /api/reports
 * Submits a new crisis report (multipart/form-data)
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
      language
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
      // Run in background or wait. We wait and log, but preserve the submitted damage level as requested.
      // A production app might overwrite or suggest updates, we just invoke it to show the hook is working.
      await classifyDamage(absolutePath);
    }

    // 3. LibreTranslate translation
    const descriptionTranslated = await translateDescription(description, reportLanguage);

    // 4. Location Versioning logic (within 50 meters of existing location group)
    let locationGroupId;
    let isLatest = true;
    let hasExistingGroup = false;

    const versionCheckQuery = `
      SELECT location_group_id, 
             ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) AS distance 
      FROM reports 
      WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 50)
      ORDER BY distance ASC 
      LIMIT 1
    `;
    const verRes = await db.query(versionCheckQuery, [lngVal, latVal]);
    
    if (verRes.rows.length > 0) {
      locationGroupId = verRes.rows[0].location_group_id;
      hasExistingGroup = true;
    } else {
      locationGroupId = crypto.randomUUID();
    }

    // 5. Duplicate Detection (check within the same location group AND same damage level in the last 5 minutes)
    let possibleDuplicate = false;
    if (hasExistingGroup) {
      const dupCheckQuery = `
        SELECT id 
        FROM reports 
        WHERE location_group_id = $1
          AND damage_level = $2
          AND submitted_at >= NOW() - INTERVAL '5 minutes'
        LIMIT 1
      `;
      const dupRes = await db.query(dupCheckQuery, [locationGroupId, damage_level]);
      if (dupRes.rows.length > 0) {
        possibleDuplicate = true;
        console.log(`[Duplicate Alert] Potential duplicate detected for group ${locationGroupId}`);
      }
    }

    // Update older records in this group as is_latest = false if NOT a duplicate
    if (hasExistingGroup) {
      if (possibleDuplicate) {
        isLatest = false;
      } else {
        await db.query(
          `UPDATE reports SET is_latest = false WHERE location_group_id = $1`,
          [locationGroupId]
        );
      }
    }

    // 6. Save Report
    const insertQuery = `
      INSERT INTO reports (
        photo_url, damage_level, infrastructure_type, infrastructure_details,
        crisis_type, has_debris, description, description_translated,
        latitude, longitude, geom, landmark_description, location_group_id,
        is_latest, possible_duplicate, language
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        ST_SetSRID(ST_MakePoint($10, $9), 4326),
        $11, $12, $13, $14, $15
      ) RETURNING *
    `;
    const saveRes = await db.query(insertQuery, [
      photoUrl,
      damage_level,
      parsedInfra,
      infrastructure_details || '',
      parsedCrisis,
      debrisBool,
      description || '',
      descriptionTranslated || description || '',
      latVal,
      lngVal,
      landmark_description || '',
      locationGroupId,
      isLatest,
      possibleDuplicate,
      reportLanguage
    ]);

    const newReport = saveRes.rows[0];

    // 7. Non-monetary Engagement: Count reports in a ~2km radius
    const count2kmQuery = `
      SELECT COUNT(*)::int as count 
      FROM reports 
      WHERE ST_DWithin(geom::geography, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, 2000)
    `;
    const countRes = await db.query(count2kmQuery, [lngVal, latVal]);
    const nearbyCount = countRes.rows[0].count;

    return res.status(201).json({
      success: true,
      report: newReport,
      nearby_count: nearbyCount
    });

  } catch (error) {
    console.error('Error creating report:', error);
    return res.status(500).json({ error: 'Server error while submitting report.' });
  }
});

/**
 * GET /api/reports
 * Returns reports as a GeoJSON FeatureCollection with filters
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
    const dbRes = await db.query(selectQuery, params);

    // Formulate GeoJSON
    const featureCollection = {
      type: 'FeatureCollection',
      features: dbRes.rows.map(row => ({
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
    const dbRes = await db.query('SELECT * FROM reports ORDER BY submitted_at DESC');
    
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
    const formattedRows = dbRes.rows.map(row => ({
      ...row,
      infrastructure_type: row.infrastructure_type.join(', '),
      crisis_type: row.crisis_type.join(', '),
      submitted_at: row.submitted_at.toISOString()
    }));
    
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
    const dbRes = await db.query('SELECT * FROM reports ORDER BY submitted_at DESC');
    
    const geojson = {
      type: 'FeatureCollection',
      features: dbRes.rows.map(row => ({
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
    
    // Check if report exists
    const checkRes = await db.query('SELECT * FROM reports WHERE id = $1', [id]);
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const report = checkRes.rows[0];

    // Optionally delete the image file
    if (report.photo_url) {
      const filePath = path.join(__dirname, '..', report.photo_url);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.query('DELETE FROM reports WHERE id = $1', [id]);

    return res.json({ success: true, message: 'Report resolved and removed.' });
  } catch (error) {
    console.error('Error deleting report:', error);
    return res.status(500).json({ error: 'Server error while deleting report.' });
  }
});

module.exports = router;
