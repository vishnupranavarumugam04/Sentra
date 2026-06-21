const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Load environment configurations
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const JWT_SECRET = process.env.JWT_SECRET || 'sentra-super-secret-key-1234';

/**
 * POST /api/auth/login
 * Validates the admin password and returns a JWT token
 */
router.post('/login', (req, res) => {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: 'Password is required.' });
  }

  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  // Create JWT token for authentication
  const token = jwt.sign(
    { role: 'admin', authenticated: true },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    success: true,
    token
  });
});

/**
 * GET /api/auth/verify
 * Optional endpoint to verify an existing token from frontend
 */
router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ success: true, user: decoded });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

module.exports = router;
