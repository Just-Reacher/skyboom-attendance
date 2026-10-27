const app = require('./app');
const config = require('./config');
const db = require('./db');
const server = app.listen(config.port, () => console.log(`Skyboom Attendance listening on :${config.port} (${config.env})`));
const stop = () => server.close(() => db.pool.end().then(() => process.exit(0)));
process.on('SIGTERM', stop); process.on('SIGINT', stop);
