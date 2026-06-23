const db = require('../db');

/**
 * Calculates and updates a reporter's score
 */
const updateReporterScore = async (fingerprint, reportDetails) => {
  let pointsEarned = 10; // Base points

  if (reportDetails.photo_url) pointsEarned += 20;
  if (reportDetails.latitude !== null && reportDetails.longitude !== null) pointsEarned += 5;
  if (reportDetails.possible_duplicate) pointsEarned -= 50;

  try {
    // Upsert reporter
    const upsertRes = await db.query(`
      INSERT INTO reporters (device_fingerprint, total_reports, score, last_report_at)
      VALUES ($1, 1, $2, NOW())
      ON CONFLICT (device_fingerprint) 
      DO UPDATE SET 
        total_reports = reporters.total_reports + 1,
        score = reporters.score + $2,
        last_report_at = NOW()
      RETURNING *
    `, [fingerprint, pointsEarned]);

    if (upsertRes.rows.length === 0) return { pointsEarned, newScore: 0, newRank: 'Newcomer' };

    let currentScore = upsertRes.rows[0].score;
    if (currentScore < 0) currentScore = 0; // Prevent negative display

    // Determine rank
    let newRank = 'Newcomer';
    if (currentScore > 400) newRank = 'Crisis Sentinel';
    else if (currentScore > 150) newRank = 'Field Reporter';
    else if (currentScore > 50) newRank = 'Observer';

    // Update rank if needed
    if (newRank !== upsertRes.rows[0].rank_label) {
      await db.query('UPDATE reporters SET rank_label = $1 WHERE device_fingerprint = $2', [newRank, fingerprint]);
    }

    // Log the submission for rate limiting
    await db.query('INSERT INTO report_rate_log (device_fingerprint) VALUES ($1)', [fingerprint]);

    return { pointsEarned, newScore: currentScore, newRank };
  } catch (err) {
    console.warn('[Gamification DB Fallback] Could not update reporter score. (DB offline)', err.message);
    return { pointsEarned, newScore: pointsEarned, newRank: 'Newcomer' };
  }
};

/**
 * Checks if the reporter has exceeded submission limits
 * Returns true if spam detected, false if allowed
 */
const checkRateLimit = async (fingerprint) => {
  try {
    // Clean up old logs (older than 24h)
    await db.query(`DELETE FROM report_rate_log WHERE submitted_at < NOW() - INTERVAL '24 hours'`);

    // Check last 1 hour
    const hourRes = await db.query(`
      SELECT COUNT(*) as count FROM report_rate_log 
      WHERE device_fingerprint = $1 AND submitted_at > NOW() - INTERVAL '1 hour'
    `, [fingerprint]);
    if (parseInt(hourRes.rows[0].count) >= 5) return true;

    // Check last 24 hours
    const dayRes = await db.query(`
      SELECT COUNT(*) as count FROM report_rate_log 
      WHERE device_fingerprint = $1 AND submitted_at > NOW() - INTERVAL '24 hours'
    `, [fingerprint]);
    if (parseInt(dayRes.rows[0].count) >= 20) return true;

    return false;
  } catch (err) {
    console.warn('[Gamification DB Fallback] Could not check rate limits. Allowing submission.', err.message);
    return false;
  }
};

module.exports = {
  updateReporterScore,
  checkRateLimit
};
