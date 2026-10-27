const crypto = require('crypto');
const { z } = require('zod');
const users = require('../repositories/users');
const schedules = require('../repositories/schedules');
const offices = require('../repositories/offices');
const attendance = require('../repositories/attendance');
const exceptions = require('../repositories/exceptions');
const audit = require('../repositories/audit');
const authSvc = require('../services/auth');
const staffSvc = require('../services/staff');
const cfgSvc = require('../services/config');
const attSvc = require('../services/attendance');
const reports = require('../services/reports');
const { ok } = require('../utils/http');
const { AppError } = require('../utils/errors');
const { localParts } = require('../utils/time');

// ---------- shared schemas ----------
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.');
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the format HH:MM.');
const iso = z.string().datetime({ message: 'Invalid date/time.' });
const reason = z.string().trim().min(5, 'A reason of at least 5 characters is required.').max(500);
const password = z.string().min(10, 'Password must be at least 10 characters.').max(100)
  .refine((p) => /[a-z]/i.test(p) && /\d/.test(p), 'Password must contain letters and at least one number.');
const id = (v) => { const n = Number(v); if (!Number.isInteger(n) || n < 1) throw new AppError(400, 'BAD_ID', 'Invalid id.'); return n; };
const paging = (q) => { const limit = Math.min(Number(q.limit) || 25, 100); return { limit, offset: ((Number(q.page) || 1) - 1) * limit }; };
const ip = (req) => req.ip;

const S = {
  login: z.object({ email: z.string().email().max(160), password: z.string().min(1).max(100) }),
  changePw: z.object({ current_password: z.string().min(1), new_password: password }),
  location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().min(0).max(100000) }),
  exception: z.object({ work_date: date, type: z.enum(['check_in', 'check_out']), reason }),
  histQuery: z.object({ from: date.optional(), to: date.optional(), status: z.string().optional(), page: z.string().optional(), limit: z.string().optional() }),
  staffCreate: z.object({ staff_no: z.string().trim().min(1).max(30), full_name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160),
    department: z.string().trim().max(80).optional().nullable(), role: z.enum(['admin', 'staff']), password }),
  staffUpdate: z.object({ staff_no: z.string().trim().min(1).max(30), full_name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(160),
    department: z.string().trim().max(80).nullable(), role: z.enum(['admin', 'staff']), status: z.enum(['active', 'inactive']) }).partial(),
  resetPw: z.object({ password }),
  attQuery: z.object({ user_id: z.string().optional(), from: date.optional(), to: date.optional(), status: z.string().optional(), department: z.string().optional(), page: z.string().optional(), limit: z.string().optional() }),
  correct: z.object({ check_in_at: iso.optional(), check_out_at: iso.nullable().optional(), reason }),
  adminCreate: z.object({ user_id: z.number().int().positive(), work_date: date, check_in_at: iso, check_out_at: iso.nullable().optional(), reason }),
  review: z.object({ decision: z.enum(['approve', 'reject']), note: reason, time: iso.optional() }),
  schedule: z.object({ name: z.string().trim().min(2).max(120), working_days: z.array(z.number().int().min(1).max(7)).min(1).max(7), start_time: time, end_time: time,
    grace_minutes: z.number().int().min(0).max(240), absence_deadline: time, early_departure_enabled: z.boolean(), effective_from: date })
    .refine((s) => s.end_time > s.start_time, 'End time must be after start time.').refine((s) => s.absence_deadline > s.start_time, 'Absence deadline must be after start time.'),
  office: z.object({ name: z.string().trim().min(2).max(120), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180),
    radius_m: z.number().int().min(10).max(5000), max_accuracy_m: z.number().int().min(5).max(1000), reason }),
  report: z.object({ from: date, to: date, user_id: z.string().optional(), status: z.enum(['on_time', 'late', 'absent', 'incomplete', 'early_departure']).optional(), department: z.string().optional() }),
  auditQuery: z.object({ action: z.string().max(60).optional(), actor_id: z.string().optional(), from: date.optional(), to: date.optional(), page: z.string().optional(), limit: z.string().optional() }),
  overviewQuery: z.object({ date: date.optional() }),
};

// ---------- auth ----------
const C = {};
C.csrf = (req, res) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  ok(res, { token: req.session.csrf });
};
C.login = async (req, res) => {
  const u = await authSvc.login(req.body.email, req.body.password, ip(req));
  await new Promise((r, j) => req.session.regenerate((e) => (e ? j(e) : r())));
  req.session.user = { id: u.id, role: u.role };
  req.session.csrf = crypto.randomBytes(24).toString('hex');
  await new Promise((r, j) => req.session.save((e) => (e ? j(e) : r())));
  ok(res, { user: u });
};
C.logout = (req, res) => req.session.destroy(() => { res.clearCookie('skyboom.sid'); ok(res, null); });
C.me = (req, res) => ok(res, { user: req.user });
C.changePassword = async (req, res) => {
  await authSvc.changePassword(req.user.id, req.body.current_password, req.body.new_password, ip(req));
  ok(res, null);
};

// ---------- staff ----------
C.today = async (req, res) => ok(res, await attSvc.today(req.user));
C.checkIn = async (req, res) => ok(res, await attSvc.checkIn(req.user, req.body), null, 201);
C.checkOut = async (req, res) => ok(res, await attSvc.checkOut(req.user, req.body));
C.myHistory = async (req, res) => {
  const { limit, offset } = paging(req.query);
  const r = await attendance.history(req.user.id, { from: req.query.from, to: req.query.to, status: req.query.status }, limit, offset);
  ok(res, r.rows, { total: r.total, limit });
};
C.myExceptions = async (req, res) => ok(res, await exceptions.listUser(req.user.id));
C.requestException = async (req, res) => ok(res, await attSvc.requestException(req.user, req.body), null, 201);

// ---------- admin ----------
C.overview = async (req, res) => ok(res, await attSvc.overview(req.query.date || localParts().date));
C.listStaff = async (req, res) => ok(res, await users.list({ q: req.query.q, status: req.query.status, role: req.query.role }));
C.createStaff = async (req, res) => ok(res, await staffSvc.create(req.user, req.body, ip(req)), null, 201);
C.updateStaff = async (req, res) => ok(res, await staffSvc.update(req.user, id(req.params.id), req.body, ip(req)));
C.resetStaffPw = async (req, res) => { await staffSvc.resetPassword(req.user, id(req.params.id), req.body.password, ip(req)); ok(res, null); };
C.listAttendance = async (req, res) => {
  const { limit, offset } = paging(req.query);
  const q = req.query;
  if (q.status === 'absent') {
    if (!q.from || !q.to) throw new AppError(400, 'RANGE_REQUIRED', 'Choose a date range to list absences.');
    const rows = await attendance.absences({ from: q.from, to: q.to, userId: q.user_id && id(q.user_id), department: q.department });
    return ok(res, rows.slice(offset, offset + limit).map((r) => ({ ...r, status: 'absent', state: 'absent' })), { total: rows.length, limit });
  }
  const r = await attendance.list({ userId: q.user_id && id(q.user_id), from: q.from, to: q.to, status: q.status, department: q.department }, limit, offset);
  ok(res, r.rows, { total: r.total, limit });
};
C.createAttendance = async (req, res) => ok(res, await attSvc.adminCreate(req.user, req.body, ip(req)), null, 201);
C.correctAttendance = async (req, res) => ok(res, await attSvc.adminCorrect(req.user, id(req.params.id), req.body, ip(req)));
C.listExceptions = async (req, res) => ok(res, await exceptions.listAdmin(req.query.status));
C.reviewException = async (req, res) => { await attSvc.reviewException(req.user, id(req.params.id), req.body, ip(req)); ok(res, null); };
C.listSchedules = async (req, res) => ok(res, await schedules.list());
C.createSchedule = async (req, res) => ok(res, await cfgSvc.createSchedule(req.user, req.body, ip(req)), null, 201);
C.getOffice = async (req, res) => ok(res, (await offices.active()) || null);
C.setOffice = async (req, res) => { const { reason: r, ...o } = req.body; ok(res, await cfgSvc.setOffice(req.user, o, r, ip(req)), null, 201); };
const reportFilters = (q) => ({ from: q.from, to: q.to, userId: q.user_id && id(q.user_id), status: q.status, department: q.department });
C.report = async (req, res) => ok(res, await reports.build(reportFilters(req.query)));
C.reportCsv = async (req, res) => {
  const rep = await reports.build(reportFilters(req.query));
  await audit.log({ actorId: req.user.id, action: 'report.exported', entity: 'report', after: { format: 'csv', from: rep.from, to: rep.to, rows: rep.rows.length }, ip: ip(req) });
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="attendance_${rep.from}_to_${rep.to}.csv"` }).send(reports.toCsv(rep));
};
C.reportPdf = async (req, res) => {
  const rep = await reports.build(reportFilters(req.query));
  await audit.log({ actorId: req.user.id, action: 'report.exported', entity: 'report', after: { format: 'pdf', from: rep.from, to: rep.to, rows: rep.rows.length }, ip: ip(req) });
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="attendance_${rep.from}_to_${rep.to}.pdf"` });
  reports.toPdf(rep, res);
};
C.auditLogs = async (req, res) => {
  const { limit, offset } = paging(req.query);
  const q = req.query;
  const r = await audit.list({ action: q.action, actorId: q.actor_id && id(q.actor_id), from: q.from, to: q.to, limit, offset });
  ok(res, r.rows, { total: r.total, limit });
};
module.exports = { C, S };
