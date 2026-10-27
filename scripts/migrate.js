// Creates tables and (only if none exist) a PROVISIONAL work schedule.
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
(async () => {
  await db.query(fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8'));
  const { rows } = await db.query('SELECT 1 FROM work_schedules LIMIT 1');
  if (!rows.length) {
    await db.query(
      `INSERT INTO work_schedules (name, working_days, start_time, end_time, grace_minutes, absence_deadline, early_departure_enabled, effective_from)
       VALUES ('PROVISIONAL - awaiting Skyboom approval', '{1,2,3,4,5}', '08:00', '17:00', 15, '10:00', FALSE, DATE '2000-01-01')`
    );
    console.log('Inserted PROVISIONAL schedule (Mon-Fri 08:00-17:00, 15 min grace, absence deadline 10:00 - not an official policy).');
  }
  console.log('Migration complete. Office location is NOT seeded: an admin must configure it.');
  await db.pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
