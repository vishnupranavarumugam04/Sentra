const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db');

const inMemoryAlerts = [];

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
 * /api/emergency-alerts:
 *   post:
 *     summary: Create an emergency SOS alert
 *     description: Triggers a high-priority SOS alert to the admin dashboard.
 *     tags: [Alerts]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message:
 *                 type: string
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *     responses:
 *       201:
 *         description: Alert created
 */
router.post('/', async (req, res) => {
  try {
    const { message, latitude = null, longitude = null, metadata = null, alert_type = 'SOS' } = req.body;
    const finalMessage = message || 'Emergency SOS alert from user.';

    let alertData = {
      id: 'local-fallback-id',
      alert_type,
      message: finalMessage,
      latitude,
      longitude,
      metadata,
      created_at: new Date()
    };

    try {
      const insertResult = await db.query(
        `INSERT INTO emergency_alerts (alert_type, message, latitude, longitude, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [alert_type, finalMessage, latitude, longitude, metadata]
      );
      if (insertResult && insertResult.rows.length > 0) {
        alertData = insertResult.rows[0];
      }
    } catch (dbError) {
      console.warn('[DB Fallback] Could not save SOS to database (DB down). Returning success anyway to UI.', dbError.message);
      inMemoryAlerts.unshift(alertData);
    }

    return res.status(201).json({ success: true, alert: alertData });
  } catch (error) {
    console.error('Error creating emergency alert:', error);
    return res.status(500).json({ error: 'Server error while creating emergency alert.' });
  }
});
/**
 * @swagger
 * /api/emergency-alerts:
 *   get:
 *     summary: Retrieve emergency alerts
 *     description: Returns a list of all emergency alerts.
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of alerts
 *       401:
 *         description: Unauthorized
 */
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM emergency_alerts ORDER BY created_at DESC');
    return res.json({ alerts: [...inMemoryAlerts, ...result.rows] });
  } catch (error) {
    console.warn('[DB Fallback] Error fetching emergency alerts. Serving in-memory fallback.', error.message);
    return res.json({ alerts: inMemoryAlerts });
  }
});
/**
 * @swagger
 * /api/emergency-alerts/{id}/acknowledge:
 *   patch:
 *     summary: Acknowledge an alert
 *     description: Marks an emergency alert as acknowledged.
 *     tags: [Alerts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Alert acknowledged
 *       404:
 *         description: Alert not found
 */
router.patch('/:id/acknowledge', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let updatedAlert = null;
    
    try {
      const result = await db.query(
        `UPDATE emergency_alerts
         SET acknowledged = true, acknowledged_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [id]
      );
      if (result.rows.length > 0) {
        updatedAlert = result.rows[0];
      }
    } catch (dbError) {
      console.warn('[DB Fallback] Could not acknowledge alert in DB.', dbError.message);
    }

    // Check in-memory fallback if not found in DB
    if (!updatedAlert) {
      const idx = inMemoryAlerts.findIndex(a => a.id === id);
      if (idx !== -1) {
        inMemoryAlerts[idx].acknowledged = true;
        inMemoryAlerts[idx].acknowledged_at = new Date();
        updatedAlert = inMemoryAlerts[idx];
      }
    }

    if (!updatedAlert) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    return res.json({ success: true, alert: updatedAlert });
  } catch (error) {
    console.error('Error acknowledging emergency alert:', error);
    return res.status(500).json({ error: 'Server error while acknowledging emergency alert.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    let deleted = false;
    
    try {
      const result = await db.query('DELETE FROM emergency_alerts WHERE id = $1 RETURNING *', [id]);
      if (result.rows.length > 0) deleted = true;
    } catch (dbError) {
      console.warn('[DB Fallback] Could not delete alert from DB.', dbError.message);
    }

    // Check in-memory fallback
    const idx = inMemoryAlerts.findIndex(a => a.id === id);
    if (idx !== -1) {
      inMemoryAlerts.splice(idx, 1);
      deleted = true;
    }

    if (!deleted) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    return res.json({ success: true, message: 'Alert removed.' });
  } catch (error) {
    console.error('Error deleting emergency alert:', error);
    return res.status(500).json({ error: 'Server error while deleting emergency alert.' });
  }
});

module.exports = router;
