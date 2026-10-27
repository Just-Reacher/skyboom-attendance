// End-to-end smoke test against a RUNNING server + migrated database.
// Usage: BASE=http://localhost:3000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/smoke-test.js
// WARNING: creates test data (a test staff user, a new office location and schedule). Use a throwaway database.
const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : '  ' + extra}`); };

function client() {
  let cookie = '', csrf = '';
  const call = async (method, path, body, { noCsrf = false } = {}) => {
    if (method !== 'GET' && !csrf && !noCsrf) csrf = (await (await raw('GET', '/api/auth/csrf')).json()).data.token;
    return raw(method, path, body, noCsrf);
  };
  const raw = async (method, path, body, noCsrf) => {
    const res = await fetch(BASE + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(method !== 'GET' && !noCsrf && csrf ? { 'X-CSRF-Token': csrf } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.getSetCookie?.() || []; if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    return res;
  };
  return { call, reset: () => { csrf = ''; } };
}
const j = async (r) => r.json();
(async () => {
  const email = process.env.ADMIN_EMAIL, pw0 = process.env.ADMIN_PASSWORD;
  const admin = client(), staff = client(), anon = client();

  let r = await anon.call('POST', '/api/auth/login', { email, password: 'wrong-password' });
  check('login with wrong password rejected', r.status === 401);
  r = await anon.call('GET', '/api/admin/staff'); check('unauthenticated API call rejected', r.status === 401);
  r = await anon.call('POST', '/api/auth/login', { email, password: pw0 }, { noCsrf: true }); check('login without CSRF token rejected', r.status === 403);

  r = await admin.call('POST', '/api/auth/login', { email, password: pw0 }); check('admin login', r.status === 200);
  admin.reset();
  r = await admin.call('GET', '/api/admin/staff'); check('forced password change blocks other endpoints', r.status === 403 && (await j(r)).error.code === 'PASSWORD_CHANGE_REQUIRED');
  const pw1 = 'NewAdminPass456';
  r = await admin.call('POST', '/api/auth/password', { current_password: pw0, new_password: pw1 }); check('admin changes password', r.status === 200);
  r = await admin.call('GET', '/api/admin/staff'); check('admin API works after password change', r.status === 200);

  r = await admin.call('PUT', '/api/admin/office', { name: 'TEST OFFICE (not real coordinates)', latitude: 5.6037, longitude: -0.187, radius_m: 100, max_accuracy_m: 50, reason: 'smoke test' }); check('admin sets office', r.status === 201);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Accra' });
  r = await admin.call('POST', '/api/schedules'.replace('/api/', '/api/admin/'), { name: 'SMOKE TEST all-day', working_days: [1, 2, 3, 4, 5, 6, 7], start_time: '00:00', end_time: '23:59', grace_minutes: 15, absence_deadline: '23:00', early_departure_enabled: true, effective_from: today });
  check('admin creates schedule effective today', r.status === 201, await r.text());
  r = await admin.call('POST', '/api/admin/schedules', { name: 'x', working_days: [1], start_time: '00:00', end_time: '23:59', grace_minutes: 15, absence_deadline: '23:00', early_departure_enabled: true, effective_from: '2001-01-01' });
  check('backdated schedule rejected', r.status === 400);

  const sn = 'T' + Date.now() % 100000, semail = `${sn}@test.local`, spw = 'StaffPass123';
  r = await admin.call('POST', '/api/admin/staff', { staff_no: sn, full_name: 'Test Staff', email: semail, department: 'Ops', role: 'staff', password: spw }); const created = await j(r);
  check('admin creates staff', r.status === 201 && !('password_hash' in created.data));
  r = await admin.call('POST', '/api/admin/staff', { staff_no: sn, full_name: 'Dup', email: semail, role: 'staff', password: spw }); check('duplicate staff rejected', r.status === 409);
  r = await admin.call('POST', '/api/admin/staff', { staff_no: 'W1', full_name: 'Weak', email: 'w@test.local', role: 'staff', password: 'short' }); check('weak password rejected', r.status === 400);

  r = await staff.call('POST', '/api/auth/login', { email: semail, password: spw }); check('staff login', r.status === 200); staff.reset();
  r = await staff.call('POST', '/api/auth/password', { current_password: spw, new_password: 'StaffPass456' }); check('staff changes password', r.status === 200);
  r = await staff.call('GET', '/api/admin/staff'); check('staff blocked from admin API (403)', r.status === 403);
  r = await staff.call('GET', '/admin'); check('staff redirected from admin page', r.status === 302);

  const T = await j(await staff.call('GET', '/api/attendance/today')); check('today: can check in', T.data.canCheckIn === true, JSON.stringify(T));
  r = await staff.call('POST', '/api/attendance/check-in', { latitude: 5.6137, longitude: -0.187, accuracy: 10 }); check('check-in outside geofence rejected', r.status === 422 && (await j(r)).error.code === 'OUTSIDE_GEOFENCE');
  r = await staff.call('POST', '/api/attendance/check-in', { latitude: 5.6037, longitude: -0.187, accuracy: 500 }); check('check-in with poor accuracy rejected', r.status === 422 && (await j(r)).error.code === 'LOW_ACCURACY');
  r = await staff.call('POST', '/api/attendance/check-out', { latitude: 5.6037, longitude: -0.187, accuracy: 10 }); check('check-out before check-in rejected', r.status === 409 && (await j(r)).error.code === 'NOT_CHECKED_IN');
  r = await staff.call('POST', '/api/attendance/check-in', { latitude: 5.6037, longitude: -0.187, accuracy: 10, check_in_at: '2020-01-01T00:00:00Z', status: 'on_time' }); const ci = await j(r);
  check('check-in inside geofence accepted (client time/status ignored)', r.status === 201 && ci.data.source === 'self' && new Date(ci.data.check_in_at).getFullYear() >= 2026, JSON.stringify(ci));
  r = await staff.call('POST', '/api/attendance/check-in', { latitude: 5.6037, longitude: -0.187, accuracy: 10 }); check('duplicate check-in rejected', r.status === 409);
  const concurrent = await Promise.all([1, 2, 3].map(() => staff.call('POST', '/api/attendance/check-out', { latitude: 5.6037, longitude: -0.187, accuracy: 10 })));
  check('concurrent check-outs: exactly one succeeds', concurrent.filter((x) => x.status === 200).length === 1, concurrent.map((x) => x.status).join(','));
  r = await staff.call('POST', '/api/attendance/check-out', { latitude: 5.6037, longitude: -0.187, accuracy: 10 }); check('second check-out rejected', r.status === 409);
  const H = await j(await staff.call('GET', '/api/attendance/history')); check('staff sees own history only', H.data.length === 1 && H.data[0].staff_no === sn);

  const attId = H.data[0].id;
  r = await admin.call('PATCH', '/api/admin/attendance/' + attId, { check_in_at: new Date(Date.now() - 3600e3).toISOString() }); check('correction without reason rejected', r.status === 400);
  r = await admin.call('PATCH', '/api/admin/attendance/' + attId, { check_in_at: new Date(Date.now() - 7200e3).toISOString(), reason: 'Smoke test correction' }); check('correction with reason accepted', r.status === 200, await r.text());
  const A = await j(await admin.call('GET', '/api/admin/audit-logs?action=attendance.corrected'));
  check('correction audited with before/after + reason', A.data.length >= 1 && A.data[0].before_value && A.data[0].after_value && A.data[0].reason === 'Smoke test correction');
  const O = await j(await admin.call('GET', '/api/admin/overview')); check('overview returns real counts', O.data.checked_in >= 1 && O.data.total_active_staff >= 1, JSON.stringify(O.data));

  const q = `from=${today}&to=${today}`;
  r = await admin.call('GET', `/api/admin/reports?${q}`); const rep = await j(r); check('report JSON', r.status === 200 && rep.data.totals.present >= 1);
  r = await admin.call('GET', `/api/admin/reports/export.csv?${q}`); const csv = await r.text(); check('CSV export', r.status === 200 && csv.includes('Attendance Report') && csv.includes(sn));
  r = await admin.call('GET', `/api/admin/reports/export.pdf?${q}`); const pdf = Buffer.from(await r.arrayBuffer()); check('PDF export', r.status === 200 && pdf.slice(0, 4).toString() === '%PDF');

  r = await staff.call('POST', '/api/attendance/exceptions', { work_date: today, type: 'check_in', reason: 'phone GPS failed' }); check('exception for existing record rejected', r.status === 409);
  r = await admin.call('PATCH', '/api/admin/staff/' + created.data.id, { status: 'inactive' }); check('admin deactivates staff', r.status === 200);
  r = await staff.call('GET', '/api/attendance/today'); check('deactivated staff session invalidated', r.status === 401);
  r = await anon.call('POST', '/api/auth/login', { email: semail, password: 'StaffPass456' }, { noCsrf: false }); check('deactivated staff cannot log in', r.status === 403);
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
