const db = require('../db');
exports.forDate = (date, c = db) =>
  c.query('SELECT * FROM work_schedules WHERE effective_from <= $1 ORDER BY effective_from DESC, id DESC LIMIT 1', [date]).then((r) => r.rows[0]);
exports.list = () => db.query('SELECT * FROM work_schedules ORDER BY effective_from DESC').then((r) => r.rows);
exports.insert = (s, c = db) =>
  c.query(
    `INSERT INTO work_schedules (name, working_days, start_time, end_time, grace_minutes, absence_deadline, early_departure_enabled, effective_from, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [s.name, s.working_days, s.start_time, s.end_time, s.grace_minutes, s.absence_deadline, s.early_departure_enabled, s.effective_from, s.created_by]
  ).then((r) => r.rows[0]);
