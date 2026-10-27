const db = require('../db');
const SEL = `SELECT e.*, u.full_name, u.staff_no, r.full_name AS reviewer_name FROM attendance_exceptions e
  JOIN users u ON u.id=e.user_id LEFT JOIN users r ON r.id=e.reviewed_by`;
exports.insert = (x, c = db) =>
  c.query(`INSERT INTO attendance_exceptions (user_id, work_date, type, reason) VALUES ($1,$2,$3,$4) RETURNING *`, [x.user_id, x.work_date, x.type, x.reason]).then((r) => r.rows[0]);
exports.byId = (id, c = db, lock = false) => c.query(`${SEL} WHERE e.id=$1 ${lock ? 'FOR UPDATE OF e' : ''}`, [id]).then((r) => r.rows[0]);
exports.listAdmin = (status) => db.query(`${SEL} ${status ? 'WHERE e.status=$1' : ''} ORDER BY e.created_at DESC LIMIT 200`, status ? [status] : []).then((r) => r.rows);
exports.listUser = (userId) => db.query(`${SEL} WHERE e.user_id=$1 ORDER BY e.created_at DESC LIMIT 20`, [userId]).then((r) => r.rows);
exports.review = (id, adminId, status, note, attendanceId, c = db) =>
  c.query(`UPDATE attendance_exceptions SET status=$2, reviewed_by=$3, reviewed_at=now(), review_note=$4, attendance_id=$5 WHERE id=$1`, [id, status, adminId, note, attendanceId || null]);
exports.pendingCount = () => db.query(`SELECT count(*)::int n FROM attendance_exceptions WHERE status='pending'`).then((r) => r.rows[0].n);
