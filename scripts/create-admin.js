// Usage: INITIAL_ADMIN_PASSWORD='...' node scripts/create-admin.js "Full Name" email@example.com STAFFNO
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const [name, email, staffNo = 'ADMIN001'] = process.argv.slice(2);
const pw = process.env.INITIAL_ADMIN_PASSWORD;
if (!name || !email || !pw || pw.length < 10) {
  console.error('Usage: INITIAL_ADMIN_PASSWORD=<min 10 chars> node scripts/create-admin.js "Full Name" email [staffNo]');
  process.exit(1);
}
(async () => {
  const hash = await bcrypt.hash(pw, 12);
  await db.query(
    `INSERT INTO users (staff_no, full_name, email, role, password_hash, must_change_password) VALUES ($1,$2,$3,'admin',$4,TRUE)`,
    [staffNo, name, email, hash]
  );
  console.log('Admin created. They must change the password at first login.');
  await db.pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
