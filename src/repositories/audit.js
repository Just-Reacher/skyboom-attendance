const db = require('../db');
exports.log = ({ actorId = null, action, entity = null, entityId = null, reason = null, before = null, after = null, ip = null }, c = db) =>
  c.query(
    `INSERT INTO audit_logs (actor_id, action, entity, entity_id, reason, before_value, after_value, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [actorId, action, entity, entityId == null ? null : String(entityId), reason, before, after, ip]
  );
exports.list = async ({ action, actorId, from, to, limit, offset }) => {
  const w = [], p = [];
  if (action) { p.push(`${action}%`); w.push(`l.action LIKE $${p.length}`); }
  if (actorId) { p.push(actorId); w.push(`l.actor_id = $${p.length}`); }
  if (from) { p.push(from); w.push(`(l.created_at AT TIME ZONE 'Africa/Accra')::date >= $${p.length}`); }
  if (to) { p.push(to); w.push(`(l.created_at AT TIME ZONE 'Africa/Accra')::date <= $${p.length}`); }
  const where = w.length ? 'WHERE ' + w.join(' AND ') : '';
  const total = (await db.query(`SELECT count(*)::int n FROM audit_logs l ${where}`, p)).rows[0].n;
  p.push(limit, offset);
  const rows = (await db.query(
    `SELECT l.id, l.created_at, l.action, l.entity, l.entity_id, l.reason, l.before_value, l.after_value, l.ip, u.full_name AS actor_name
     FROM audit_logs l LEFT JOIN users u ON u.id = l.actor_id ${where}
     ORDER BY l.id DESC LIMIT $${p.length - 1} OFFSET $${p.length}`, p)).rows;
  return { rows, total };
};
