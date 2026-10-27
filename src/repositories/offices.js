const db = require('../db');
exports.active = (c = db) => c.query('SELECT * FROM office_locations WHERE is_active LIMIT 1').then((r) => r.rows[0]);
exports.deactivateAll = (c) => c.query('UPDATE office_locations SET is_active=FALSE WHERE is_active');
exports.insert = (o, c = db) =>
  c.query(
    `INSERT INTO office_locations (name, latitude, longitude, radius_m, max_accuracy_m, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [o.name, o.latitude, o.longitude, o.radius_m, o.max_accuracy_m, o.created_by]
  ).then((r) => r.rows[0]);
