const db = require('../db');
const PUBLIC = 'id, staff_no, full_name, email, department, role, status, must_change_password, last_login_at, created_at';
exports.byId = (id, c = db) => c.query(`SELECT ${PUBLIC} FROM users WHERE id=$1`, [id]).then((r) => r.rows[0]);
exports.byEmailWithHash = (email) => db.query('SELECT * FROM users WHERE lower(email)=lower($1)', [email]).then((r) => r.rows[0]);
exports.hashById = (id) => db.query('SELECT password_hash FROM users WHERE id=$1', [id]).then((r) => r.rows[0]?.password_hash);
exports.list = ({ q, status, role }) => {
  const w = [], p = [];
  if (q) { p.push(`%${q}%`); w.push(`(full_name ILIKE $${p.length} OR email ILIKE $${p.length} OR staff_no ILIKE $${p.length})`); }
  if (status) { p.push(status); w.push(`status=$${p.length}`); }
  if (role) { p.push(role); w.push(`role=$${p.length}`); }
  return db.query(`SELECT ${PUBLIC} FROM users ${w.length ? 'WHERE ' + w.join(' AND ') : ''} ORDER BY full_name`, p).then((r) => r.rows);
};
exports.insert = (u, c = db) =>
  c.query(
    `INSERT INTO users (staff_no, full_name, email, department, role, password_hash, must_change_password) VALUES ($1,$2,$3,$4,$5,$6,TRUE) RETURNING ${PUBLIC}`,
    [u.staff_no, u.full_name, u.email, u.department || null, u.role, u.password_hash]
  ).then((r) => r.rows[0]);
exports.update = (id, fields, c = db) => {
  const keys = Object.keys(fields);
  const set = keys.map((k, i) => `${k}=$${i + 2}`).join(',');
  return c.query(`UPDATE users SET ${set}, updated_at=now() WHERE id=$1 RETURNING ${PUBLIC}`, [id, ...keys.map((k) => fields[k])]).then((r) => r.rows[0]);
};
exports.setPassword = (id, hash, mustChange, c = db) =>
  c.query('UPDATE users SET password_hash=$2, must_change_password=$3, failed_login_count=0, locked_until=NULL, updated_at=now() WHERE id=$1', [id, hash, mustChange]);
exports.recordFailure = (id) =>
  db.query(
    `UPDATE users SET
       failed_login_count = CASE WHEN failed_login_count+1 >= 5 THEN 0 ELSE failed_login_count+1 END,
       locked_until = CASE WHEN failed_login_count+1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
     WHERE id=$1 RETURNING failed_login_count, locked_until`, [id]).then((r) => r.rows[0]);
exports.recordSuccess = (id) => db.query('UPDATE users SET failed_login_count=0, locked_until=NULL, last_login_at=now() WHERE id=$1', [id]);
exports.countActiveStaff = () => db.query(`SELECT count(*)::int n FROM users WHERE role='staff' AND status='active'`).then((r) => r.rows[0].n);
exports.killSessions = (id, c = db) => c.query(`DELETE FROM session WHERE (sess->'user'->>'id') = $1`, [String(id)]);
