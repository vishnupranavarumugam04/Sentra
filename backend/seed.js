const { Pool } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

if (process.env.NODE_ENV === 'production' || process.env.ENABLE_SEED_DATA !== 'true') {
  console.warn('⚠️ Seeding is disabled (ENABLE_SEED_DATA is not "true" or NODE_ENV is "production"). Exiting.');
  process.exit(0);
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } // Required for online database hosts
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'sentra',
    });

const damageLevels = ['Minimal/No damage', 'Partially damaged', 'Completely damaged'];

const infraTypes = [
  'Residential', 'Commercial', 'Government', 'Utility',
  'Transport & Communication', 'Community', 'Public Spaces/Recreation', 'Other'
];

const crisisTypes = [
  'Earthquake', 'Flood', 'Tsunami', 'Hurricane/Cyclone',
  'Wildfire', 'Explosion', 'Chemical incident', 'Conflict', 'Civil unrest'
];

const photoUrls = {
  'Minimal/No damage': [
    'https://images.unsplash.com/photo-1594897030264-ab7d87efc473?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?auto=format&fit=crop&w=600&q=80'
  ],
  'Partially damaged': [
    'https://images.unsplash.com/photo-1546955870-9fc6f1ef456e?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=600&q=80'
  ],
  'Completely damaged': [
    'https://images.unsplash.com/photo-1518742589400-366ed214b733?auto=format&fit=crop&w=600&q=80',
    'https://images.unsplash.com/photo-1473163928189-364b2c4e1135?auto=format&fit=crop&w=600&q=80'
  ]
};

const detailsTemplate = {
  Residential: 'Apartment complex exterior wall cracks',
  Commercial: 'Grocery store storefront facade collapse',
  Government: 'District collectorate office shingles damaged',
  Utility: 'Power distribution transformer down',
  'Transport & Communication': 'Bridge pillar showing structural distress',
  Community: 'Primary school roof partially blown away',
  'Public Spaces/Recreation': 'Park pathway submerged under mud and debris',
  Other: 'Water storage tank leakage'
};

const descriptions = [
  'Minor cracking observed along the foundation. No immediate structural danger but needs inspection.',
  'Flooding up to waist height. Power cables are submerged. Debris blocking the main entryway.',
  'Structure completely flattened. Heavy concrete slabs blocking road. Search and rescue advised.',
  'Strong winds caused tin roof sheets to fly off. Water ingress inside classrooms.',
  'Large tree has fallen across communication lines. Local traffic is diverted.',
  'Landslide has partially covered the retaining wall. Soil stability looks compromised.'
];

// Chennai center coordinates
const CHENNAI_LAT = 13.0827;
const CHENNAI_LNG = 80.2707;

function getRandomElem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomSubset(arr, max = 2) {
  const size = Math.floor(Math.random() * max) + 1;
  const shuffled = [...arr].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, size);
}

async function seed() {
  console.log('Starting seed process...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Clear old data
    await client.query('TRUNCATE TABLE reports CASCADE;');
    console.log('Truncated reports table.');

    const seedReports = [];

    // 1. Generate 20 independent latest reports
    for (let i = 0; i < 20; i++) {
      const damage = getRandomElem(damageLevels);
      const infra = getRandomSubset(infraTypes, 2);
      const crisis = getRandomSubset(crisisTypes, 2);
      const details = detailsTemplate[infra[0]] || 'General structure';
      const desc = getRandomElem(descriptions);
      const hasDebris = Math.random() > 0.5;
      
      // Jitter coordinates around Chennai (approx 5km radius)
      const lat = CHENNAI_LAT + (Math.random() - 0.5) * 0.08;
      const lng = CHENNAI_LNG + (Math.random() - 0.5) * 0.08;
      const photo = getRandomElem(photoUrls[damage]);
      const locationGroupId = crypto.randomUUID();

      seedReports.push({
        photo_url: photo,
        damage_level: damage,
        infrastructure_type: infra,
        infrastructure_details: `${details} #${i + 1}`,
        crisis_type: crisis,
        has_debris: hasDebris,
        description: desc,
        description_translated: desc, // English translation placeholder
        latitude: lat,
        longitude: lng,
        landmark_description: 'Near local street junction',
        location_group_id: locationGroupId,
        is_latest: true,
        possible_duplicate: false,
        submitted_at: new Date(Date.now() - Math.random() * 5 * 24 * 60 * 60 * 1000), // within 5 days
        language: 'en'
      });
    }

    // 2. Generate a cluster of reports that represent historical updates (same location_group_id)
    const baseGroupId1 = crypto.randomUUID();
    const baseLat1 = 13.0850;
    const baseLng1 = 80.2800;

    // Older report (historical)
    seedReports.push({
      photo_url: photoUrls['Partially damaged'][0],
      damage_level: 'Partially damaged',
      infrastructure_type: ['Residential'],
      infrastructure_details: 'Standard residential house - initial assessment',
      crisis_type: ['Flood'],
      has_debris: true,
      description: 'Water levels rising, basement flooded, minor damage.',
      description_translated: 'Water levels rising, basement flooded, minor damage.',
      latitude: baseLat1,
      longitude: baseLng1,
      landmark_description: 'Next to Central Post Office',
      location_group_id: baseGroupId1,
      is_latest: false, // Old report
      possible_duplicate: false,
      submitted_at: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours ago
      language: 'en'
    });

    // Newer report at same location (latest)
    seedReports.push({
      photo_url: photoUrls['Completely damaged'][0],
      damage_level: 'Completely damaged',
      infrastructure_type: ['Residential'],
      infrastructure_details: 'Standard residential house - second assessment',
      crisis_type: ['Flood'],
      has_debris: true,
      description: 'Basement wall collapsed completely under hydro-static pressure. Structural failure.',
      description_translated: 'Basement wall collapsed completely under hydro-static pressure. Structural failure.',
      latitude: baseLat1 + 0.0001, // ~11 meters away
      longitude: baseLng1 - 0.0001,
      landmark_description: 'Next to Central Post Office',
      location_group_id: baseGroupId1,
      is_latest: true, // Latest version
      possible_duplicate: false,
      submitted_at: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
      language: 'en'
    });

    // 3. Generate a duplicate report (within 5 mins, same damage, same location)
    const baseGroupId2 = crypto.randomUUID();
    const baseLat2 = 13.0600;
    const baseLng2 = 80.2500;
    const timestamp2 = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes ago

    // Original report
    seedReports.push({
      photo_url: photoUrls['Partially damaged'][1],
      damage_level: 'Partially damaged',
      infrastructure_type: ['Utility'],
      infrastructure_details: 'Damaged electrical substation',
      crisis_type: ['Hurricane/Cyclone'],
      has_debris: false,
      description: 'Transformer sparked and caught fire due to high winds.',
      description_translated: 'Transformer sparked and caught fire due to high winds.',
      latitude: baseLat2,
      longitude: baseLng2,
      landmark_description: 'Near Sector 4 substation',
      location_group_id: baseGroupId2,
      is_latest: true,
      possible_duplicate: false,
      submitted_at: new Date(timestamp2.getTime() - 2 * 60 * 1000), // 4 minutes ago
      language: 'en'
    });

    // Duplicate report
    seedReports.push({
      photo_url: photoUrls['Partially damaged'][1],
      damage_level: 'Partially damaged',
      infrastructure_type: ['Utility'],
      infrastructure_details: 'Transformer fire',
      crisis_type: ['Hurricane/Cyclone'],
      has_debris: false,
      description: ' substation transformer exploded, smoke rising.',
      description_translated: ' substation transformer exploded, smoke rising.',
      latitude: baseLat2 + 0.00015, // ~15 meters away
      longitude: baseLng2,
      landmark_description: 'Opposite Substation',
      location_group_id: baseGroupId2,
      is_latest: false, // marked as historical/non-latest because it is duplicate
      possible_duplicate: true, // DUPLICATE FLAG!
      submitted_at: timestamp2,
      language: 'en'
    });

    // 4. Generate Spanish and French submissions to demonstrate LibreTranslate
    const esGroupId = crypto.randomUUID();
    seedReports.push({
      photo_url: photoUrls['Partially damaged'][0],
      damage_level: 'Partially damaged',
      infrastructure_type: ['Commercial'],
      infrastructure_details: 'Tienda local',
      crisis_type: ['Earthquake'],
      has_debris: true,
      description: 'Las paredes del supermercado tienen grietas profundas y el techo está parcialmente caído.',
      description_translated: 'The walls of the supermarket have deep cracks and the ceiling is partially fallen down.',
      latitude: 13.0900,
      longitude: 80.2900,
      landmark_description: 'Frente al parque central',
      location_group_id: esGroupId,
      is_latest: true,
      possible_duplicate: false,
      submitted_at: new Date(Date.now() - 10 * 60 * 60 * 1000), // 10 hours ago
      language: 'es'
    });

    const frGroupId = crypto.randomUUID();
    seedReports.push({
      photo_url: photoUrls['Completely damaged'][1],
      damage_level: 'Completely damaged',
      infrastructure_type: ['Transport & Communication'],
      infrastructure_details: 'Pont routier',
      crisis_type: ['Flood'],
      has_debris: true,
      description: 'Le pont est complètement effondré suite à la crue de la rivière.',
      description_translated: 'The bridge has completely collapsed following the river flooding.',
      latitude: 13.0700,
      longitude: 80.2600,
      landmark_description: 'Près de la station de métro',
      location_group_id: frGroupId,
      is_latest: true,
      possible_duplicate: false,
      submitted_at: new Date(Date.now() - 20 * 60 * 60 * 1000), // 20 hours ago
      language: 'fr'
    });

    // Insert all records
    for (const r of seedReports) {
      const query = `
        INSERT INTO reports (
          photo_url, damage_level, infrastructure_type, infrastructure_details,
          crisis_type, has_debris, description, description_translated,
          latitude, longitude, geom, landmark_description, location_group_id,
          is_latest, possible_duplicate, submitted_at, language
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          ST_SetSRID(ST_MakePoint($10, $9), 4326),
          $11, $12, $13, $14, $15, $16
        )
      `;
      await client.query(query, [
        r.photo_url, r.damage_level, r.infrastructure_type, r.infrastructure_details,
        r.crisis_type, r.has_debris, r.description, r.description_translated,
        r.latitude, r.longitude, r.landmark_description, r.location_group_id,
        r.is_latest, r.possible_duplicate, r.submitted_at, r.language
      ]);
    }

    await client.query('COMMIT');
    console.log(`Successfully seeded ${seedReports.length} reports.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding database:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
