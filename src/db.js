const { Pool, types } = require('pg');
const config = require('./config');
// Keep DATE columns as 'YYYY-MM-DD' strings (no JS timezone conversion).
types.setTypeParser(1082, (v) => v);
// BIGINT ids arrive as strings by default; return numbers so ids compare correctly in JS (safe: ids stay far below 2^53).
types.setTypeParser(20, (v) => Number(v));
const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.dbSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});
const query = (text, params) => pool.query(text, params);
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}
module.exports = { pool, query, tx };