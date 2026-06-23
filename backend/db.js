const { Pool } = require('pg');

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
      console.log('Reports table does not exist. Initializing schema...');

      // Try PostGIS schema first
      let postgisOk = false;
      try {
        await pool.query("CREATE EXTENSION IF NOT EXISTS postgis");
        await pool.query("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"");
        postgisOk = true;
        console.log('[DB] PostGIS available — creating full spatial schema.');
      } catch {
        console.warn('[DB] PostGIS not available — creating plain schema (no geom column).');
        try {
          await pool.query("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"");
        } catch { /* uuid-ossp may also be absent, use gen_random_uuid() instead */ }
      }

      if (postgisOk) {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS reports (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            photo_url TEXT,
            damage_level TEXT NOT NULL CHECK (damage_level IN ('Minimal/No damage', 'Partially damaged', 'Completely damaged')),
            infrastructure_type TEXT[] NOT NULL,
            infrastructure_details TEXT,
            crisis_type TEXT[] NOT NULL,
            has_debris BOOLEAN NOT NULL DEFAULT FALSE,
            description TEXT,
            description_translated TEXT,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            geom GEOMETRY(POINT, 4326),
            landmark_description TEXT,
            location_group_id UUID NOT NULL,
            is_latest BOOLEAN NOT NULL DEFAULT TRUE,
            possible_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
            submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            language VARCHAR(10) NOT NULL DEFAULT 'en',
            ai_suggested_level TEXT,
            ai_confidence INT,
            source TEXT DEFAULT 'web'
          )
        `);
        await pool.query(`CREATE INDEX IF NOT EXISTS reports_geom_idx ON reports USING GIST (geom)`);
      } else {
        // Plain schema without PostGIS geometry column
        await pool.query(`
          CREATE TABLE IF NOT EXISTS reports (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            photo_url TEXT,
            damage_level TEXT NOT NULL CHECK (damage_level IN ('Minimal/No damage', 'Partially damaged', 'Completely damaged')),
            infrastructure_type TEXT[] NOT NULL,
            infrastructure_details TEXT,
            crisis_type TEXT[] NOT NULL,
            has_debris BOOLEAN NOT NULL DEFAULT FALSE,
            description TEXT,
            description_translated TEXT,
            latitude DOUBLE PRECISION NOT NULL,
            longitude DOUBLE PRECISION NOT NULL,
            landmark_description TEXT,
            location_group_id UUID NOT NULL DEFAULT gen_random_uuid(),
            is_latest BOOLEAN NOT NULL DEFAULT TRUE,
            possible_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
            submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
            language VARCHAR(10) NOT NULL DEFAULT 'en',
            ai_suggested_level TEXT,
            ai_confidence INT,
            source TEXT DEFAULT 'web'
          )
        `);
      }

      // Common indexes (don't depend on PostGIS)
      await pool.query(`CREATE INDEX IF NOT EXISTS reports_damage_level_idx ON reports (damage_level)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS reports_location_group_idx ON reports (location_group_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS reports_submitted_at_idx ON reports (submitted_at)`);
      console.log('[DB] Reports table created successfully.');
    } else {
      console.log('[DB] Connected. Schema already initialized.');
    }

    // Always ensure emergency_alerts table exists (no PostGIS dependency)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS emergency_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

    // Ensure reporters table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reporters (
        device_fingerprint TEXT PRIMARY KEY,
        display_name TEXT,
        total_reports INT DEFAULT 0,
        verified_reports INT DEFAULT 0,
        spam_reports INT DEFAULT 0,
        score INT DEFAULT 0,
        rank_label TEXT DEFAULT 'Newcomer',
        last_report_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Ensure report_rate_log table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_rate_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        device_fingerprint TEXT NOT NULL,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        CONSTRAINT fk_reporter FOREIGN KEY (device_fingerprint) REFERENCES reporters(device_fingerprint) ON DELETE CASCADE
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS rate_log_fingerprint_idx ON report_rate_log(device_fingerprint, submitted_at)`);

    console.log('[DB] Emergency alerts & Gamification tables ready.');

  } catch (error) {
    console.warn('\n======================================================');
    console.warn('⚠️  DATABASE CONNECTION WARNING ⚠️');
    console.warn('Could not connect to PostgreSQL database.');
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
