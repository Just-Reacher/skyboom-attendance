const db = require('../db');
const NOW_D = `(now() AT TIME ZONE 'Africa/Accra')::date`;
const NOW_T = `(now() AT TIME ZONE 'Africa/Accra')::time`;
const STATE = `CASE WHEN a.check_out_at IS NOT NULL THEN 'completed'
  WHEN a.work_date < ${NOW_D} OR (a.work_date = ${NOW_D} AND ${NOW_T} >= a.end_time) THEN 'incomplete' ELSE 'in_progress' END`;
const EARLY = `(a.check_out_at IS NOT NULL AND a.early_departure_enabled AND (a.check_out_at AT TIME ZONE 'Africa/Accra')::time < a.end_time)`;
const COLS = `a.id, a.user_id, u.full_name, u.staff_no, u.department, a.work_date, a.check_in_at, a.check_out_at, a.status, a.source,
  a.start_time, a.end_time, a.grace_minutes, a.check_in_distance_m, a.check_in_accuracy_m, a.check_in_location_result,
  a.check_out_distance_m, a.check_out_accuracy_m, a.check_out_location_result, ${STATE} AS state, ${EARLY} AS early_departure`;
const FROM = `FROM attendance a JOIN users u ON u.id = a.user_id`;

function where(f) {
  const w = [], p = [];
  if (f.userId) { p.push(f.userId); w.push(`a.user_id=$${p.length}`); }
  if (f.from) { p.push(f.from); w.push(`a.work_date >= $${p.length}`); }
  if (f.to) { p.push(f.to); w.push(`a.work_date <= $${p.length}`); }
  if (f.department) { p.push(f.department); w.push(`u.department = $${p.length}`); }
  if (f.status === 'on_time' || f.status === 'late') { p.push(f.status); w.push(`a.status=$${p.length}`); }
  else if (['incomplete', 'in_progress', 'completed'].includes(f.status)) w.push(`(${STATE}) = '${f.status}'`);
  else if (f.status === 'early_departure') w.push(EARLY);
  return { sql: w.length ? 'WHERE ' + w.join(' AND ') : '', p };
}

exports.find = (userId, date, c = db, lock = false) =>
  c.query(`SELECT ${COLS} ${FROM} WHERE a.user_id=$1 AND a.work_date=$2 ${lock ? 'FOR UPDATE OF a' : ''}`, [userId, date]).then((r) => r.rows[0]);
exports.byId = (id, c = db, lock = false) =>
  c.query(`SELECT ${COLS} ${FROM} WHERE a.id=$1 ${lock ? 'FOR UPDATE OF a' : ''}`, [id]).then((r) => r.rows[0]);

// Returns the new row, or undefined if a record for that user/day already exists (unique constraint).
exports.insert = (r, c = db) =>
  c.query(
    `INSERT INTO attendance (user_id, work_date, check_in_at, check_out_at, status, source, schedule_id, start_time, end_time, grace_minutes,
       early_departure_enabled, check_in_distance_m, check_in_accuracy_m, check_in_location_result)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (user_id, work_date) DO NOTHING RETURNING id`,
    [r.user_id, r.work_date, r.check_in_at, r.check_out_at || null, r.status, r.source, r.schedule_id, r.start_time, r.end_time, r.grace_minutes,
      r.early_departure_enabled, r.distance ?? null, r.accuracy ?? null, r.location_result]
  ).then((x) => x.rows[0]);

exports.setCheckOut = (id, at, loc, c = db) =>
  c.query(`UPDATE attendance SET check_out_at=$2, check_out_distance_m=$3, check_out_accuracy_m=$4, check_out_location_result=$5, updated_at=now() WHERE id=$1`,
    [id, at, loc.distance ?? null, loc.accuracy ?? null, loc.result]);

exports.correct = (id, f, c = db) =>
  c.query(`UPDATE attendance SET check_in_at=$2, check_out_at=$3, status=$4, source='correction', updated_at=now() WHERE id=$1`,
    [id, f.check_in_at, f.check_out_at, f.status]);

exports.setCheckOutException = (id, at, c = db) =>
  c.query(`UPDATE attendance SET check_out_at=$2, check_out_location_result='exception_approved', source='exception', updated_at=now() WHERE id=$1`, [id, at]);

exports.list = async (f, limit, offset) => {
  const { sql, p } = where(f);
  const total = (await db.query(`SELECT count(*)::int n ${FROM} ${sql}`, p)).rows[0].n;
  const rows = (await db.query(`SELECT ${COLS} ${FROM} ${sql} ORDER BY a.work_date DESC, u.full_name LIMIT ${Number(limit)} OFFSET ${Number(offset)}`, p)).rows;
  return { rows, total };
};
exports.all = (f, cap = 5000) => {
  const { sql, p } = where(f);
  return db.query(`SELECT ${COLS} ${FROM} ${sql} ORDER BY a.work_date, u.full_name LIMIT ${cap}`, p).then((r) => r.rows);
};

// Absent = active staff, scheduled working day, deadline passed, no attendance row.
exports.absences = ({ from, to, userId, department }) => {
  const p = [from, to];
  let extra = '';
  if (userId) { p.push(userId); extra += ` AND u.id=$${p.length}`; }
  if (department) { p.push(department); extra += ` AND u.department=$${p.length}`; }
  return db.query(
    `SELECT u.id AS user_id, u.full_name, u.staff_no, u.department, d::date AS work_date
     FROM users u
     CROSS JOIN generate_series($1::timestamp, $2::timestamp, interval '1 day') d
     JOIN LATERAL (SELECT * FROM work_schedules s WHERE s.effective_from <= d::date ORDER BY s.effective_from DESC, s.id DESC LIMIT 1) s ON TRUE
     WHERE u.role='staff' AND u.status='active' AND u.created_at::date <= d::date
       AND EXTRACT(ISODOW FROM d)::int = ANY(s.working_days::int[])
       AND (d::date < ${NOW_D} OR (d::date = ${NOW_D} AND ${NOW_T} >= s.absence_deadline))
       AND NOT EXISTS (SELECT 1 FROM attendance a WHERE a.user_id=u.id AND a.work_date=d::date) ${extra}
     ORDER BY d::date, u.full_name`, p).then((r) => r.rows);
};

exports.summary = async (date) => {
  const r = (await db.query(
    `SELECT count(*)::int AS checked_in, (count(*) FILTER (WHERE a.status='late'))::int AS late,
            (count(*) FILTER (WHERE (${STATE})='incomplete'))::int AS incomplete
     ${FROM} WHERE a.work_date=$1 AND u.role='staff'`, [date])).rows[0];
  return r;
};
exports.recent = (limit = 10) =>
  db.query(`SELECT u.full_name, a.work_date, a.check_in_at, a.check_out_at, a.status FROM attendance a JOIN users u ON u.id=a.user_id
            ORDER BY GREATEST(a.check_in_at, COALESCE(a.check_out_at, a.check_in_at)) DESC LIMIT $1`, [limit]).then((r) => r.rows);
exports.history = (userId, f, limit, offset) => exports.list({ ...f, userId }, limit, offset);
