const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../db');

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

router.post('/', async (req, res) => {
  try {
    const { message, latitude = null, longitude = null, metadata = null, alert_type = 'SOS' } = req.body;
    const finalMessage = message || 'Emergency SOS alert from user.';

    const insertResult = await db.query(
      `INSERT INTO emergency_alerts (alert_type, message, latitude, longitude, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [alert_type, finalMessage, latitude, longitude, metadata]
    );

    return res.status(201).json({ success: true, alert: insertResult.rows[0] });
  } catch (error) {
    console.error('Error creating emergency alert:', error);
    return res.status(500).json({ error: 'Server error while creating emergency alert.' });
  }
});

router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM emergency_alerts ORDER BY created_at DESC');
    return res.json({ alerts: result.rows });
  } catch (error) {
    console.error('Error fetching emergency alerts:', error);
    return res.status(500).json({ error: 'Server error while fetching emergency alerts.' });
  }
});

router.patch('/:id/acknowledge', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      `UPDATE emergency_alerts
       SET acknowledged = true, acknowledged_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    return res.json({ success: true, alert: result.rows[0] });
  } catch (error) {
    console.error('Error acknowledging emergency alert:', error);
    return res.status(500).json({ error: 'Server error while acknowledging emergency alert.' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM emergency_alerts WHERE id = $1 RETURNING *', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found.' });
    }

    return res.json({ success: true, message: 'Alert removed.' });
  } catch (error) {
    console.error('Error deleting emergency alert:', error);
    return res.status(500).json({ error: 'Server error while deleting emergency alert.' });
  }
});

module.exports = router;
