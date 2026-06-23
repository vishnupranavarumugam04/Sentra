const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const db = require('./db');
const reportsRouter = require('./routes/reports');
const authRouter = require('./routes/auth');
const emergencyAlertsRouter = require('./routes/emergencyAlerts');
const webhookRouter = require('./routes/webhook');
const leaderboardRouter = require('./routes/leaderboard');
const triageRouter = require('./routes/triage');
const { swaggerUi, specs } = require('./swagger');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for all requests
app.use(cors());

// Body parser middleware (supports large file uploads if payload is big)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Ensure upload directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`Created uploads directory at: ${uploadDir}`);
}

// Serve upload folder statically
app.use('/uploads', express.static(uploadDir));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// Register routers
app.use('/api/reports', reportsRouter);
app.use('/api/auth', authRouter);
app.use('/api/emergency-alerts', emergencyAlertsRouter);
app.use('/api/leaderboard', leaderboardRouter);
app.use('/api/triage', triageRouter);
app.use('/webhook', webhookRouter);

// Swagger API Documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(specs));

// Start server and initialize database
app.listen(PORT, async () => {
  console.log(`Sentra backend server is running on port ${PORT}`);
  await db.initializeDatabase();
});
