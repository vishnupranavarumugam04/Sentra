-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop table if exists
DROP TABLE IF EXISTS reports;

-- Create reports table
CREATE TABLE reports (
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
    geom GEOMETRY(POINT, 4326) NOT NULL,
    landmark_description TEXT,
    location_group_id UUID NOT NULL,
    is_latest BOOLEAN NOT NULL DEFAULT TRUE,
    possible_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en'
);

-- Create spatial index for fast proximity queries
CREATE INDEX IF NOT EXISTS reports_geom_idx ON reports USING GIST (geom);

-- Create indexes on query filter columns
CREATE INDEX IF NOT EXISTS reports_damage_level_idx ON reports (damage_level);
CREATE INDEX IF NOT EXISTS reports_location_group_idx ON reports (location_group_id);
CREATE INDEX IF NOT EXISTS reports_is_latest_idx ON reports (is_latest);
CREATE INDEX IF NOT EXISTS reports_submitted_at_idx ON reports (submitted_at);

-- Emergency alert notifications for admin portal
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
);

CREATE INDEX IF NOT EXISTS emergency_alerts_created_at_idx ON emergency_alerts (created_at);
