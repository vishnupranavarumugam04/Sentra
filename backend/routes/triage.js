const express = require('express');
const router = express.Router();
const db = require('../db');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sentra-super-secret-key-1234';

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * @swagger
 * /api/triage/heatmap:
 *   get:
 *     summary: Retrieve heatmap data
 *     description: Returns weighted heatmap points based on damage level, infrastructure type, and density.
 *     tags: [Triage]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of points with lat, lng, and intensity
 */
router.get('/heatmap', requireAdmin, async (req, res) => {
  try {
    // Basic priority scoring fallback if no PostGIS
    const result = await db.query(`
      SELECT 
        latitude, 
        longitude, 
        damage_level,
        infrastructure_type
      FROM reports
      WHERE is_latest = true AND possible_duplicate = false
    `);

    const heatmapData = result.rows.map(row => {
      let intensity = 1;
      
      // Weight by damage
      if (row.damage_level === 'Completely damaged') intensity += 5;
      else if (row.damage_level === 'Partially damaged') intensity += 2;

      // Weight by infrastructure importance
      if (row.infrastructure_type) {
        if (row.infrastructure_type.includes('Utility')) intensity += 3; // Power/Water
        if (row.infrastructure_type.includes('Transport & Communication')) intensity += 2; // Roads/Bridges
        if (row.infrastructure_type.includes('Government')) intensity += 2; // Hospitals/Police
      }

      return [row.latitude, row.longitude, intensity];
    });

    return res.json({ heatmap: heatmapData });
  } catch (error) {
    console.error('Error generating heatmap data:', error);
    return res.status(500).json({ error: 'Server error while generating heatmap.' });
  }
});

module.exports = router;
