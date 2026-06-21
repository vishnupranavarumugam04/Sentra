const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } // Required for online DB hosts like Neon/Supabase
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'sentra',
    });

async function initializeDatabase() {
  try {
    // Check if reports table exists
    const res = await pool.query("SELECT to_regclass('public.reports') AS table_exists");
    if (!res.rows[0].table_exists) {
      console.log('Reports table does not exist. Running database schema initialization...');
      const schemaPath = path.join(__dirname, '../database/schema.sql');
      if (fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await pool.query(schemaSql);
        console.log('Database schema initialized successfully!');
      } else {
        console.warn(`schema.sql not found at ${schemaPath}. Skip initial migration.`);
      }
    } else {
      console.log('Connected to database. Schema already initialized.');
    }

    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_alerts (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        alert_type TEXT NOT NULL DEFAULT 'SOS',
        message TEXT NOT NULL,
        latitude DOUBLE PRECISION,
        longitude DOUBLE PRECISION,
        metadata JSONB,
        acknowledged BOOLEAN NOT NULL DEFAULT FALSE,
        acknowledged_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
      )
    `);
  } catch (error) {
    console.warn('\n======================================================');
    console.warn('⚠️  DATABASE CONNECTION WARNING ⚠️');
    console.warn('Could not connect to PostgreSQL/PostGIS database.');
    console.warn('Error details:', error.message);
    console.warn('Please ensure PostgreSQL is running and credentials in .env are correct.');
    console.warn('The Express server will run, but database queries will fail.');
    console.warn('======================================================\n');
  }
}

module.exports = {
  pool,
  initializeDatabase,
  query: (text, params) => pool.query(text, params),
};
