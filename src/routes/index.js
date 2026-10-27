const express = require('express');
const rateLimit = require('express-rate-limit');
const { C, S } = require('../controllers');
const { requireAuth, requireRole } = require('../middleware/auth');
const v = require('../middleware/validate');
const { wrap } = require('../utils/http');

const r = express.Router();
const limiter = (max, windowMin) => rateLimit({ windowMs: windowMin * 60e3, max, standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait and try again.' } } });

// ----- auth -----
r.get('/auth/csrf', wrap(C.csrf));
r.post('/auth/login', limiter(10, 15), v(S.login), wrap(C.login));
r.post('/auth/logout', requireAuth, wrap(C.logout));
r.get('/auth/me', requireAuth, wrap(C.me));
r.post('/auth/password', requireAuth, limiter(10, 15), v(S.changePw), wrap(C.changePassword));

// ----- staff (own data only: every query is scoped by req.user.id from the session) -----
const staff = express.Router();
staff.use(requireAuth);
staff.get('/today', wrap(C.today));
staff.post('/check-in', limiter(30, 15), v(S.location), wrap(C.checkIn));
staff.post('/check-out', limiter(30, 15), v(S.location), wrap(C.checkOut));
staff.get('/history', v(S.histQuery, 'query'), wrap(C.myHistory));
staff.get('/exceptions', wrap(C.myExceptions));
staff.post('/exceptions', limiter(20, 60), v(S.exception), wrap(C.requestException));
r.use('/attendance', staff);

// ----- admin -----
const admin = express.Router();
admin.use(requireRole('admin'));
admin.get('/overview', v(S.overviewQuery, 'query'), wrap(C.overview));
admin.get('/staff', wrap(C.listStaff));
admin.post('/staff', limiter(60, 60), v(S.staffCreate), wrap(C.createStaff));
admin.patch('/staff/:id', v(S.staffUpdate), wrap(C.updateStaff));
admin.post('/staff/:id/reset-password', limiter(30, 60), v(S.resetPw), wrap(C.resetStaffPw));
admin.get('/attendance', v(S.attQuery, 'query'), wrap(C.listAttendance));
admin.post('/attendance', v(S.adminCreate), wrap(C.createAttendance));
admin.patch('/attendance/:id', v(S.correct), wrap(C.correctAttendance));
admin.get('/exceptions', wrap(C.listExceptions));
admin.post('/exceptions/:id/review', v(S.review), wrap(C.reviewException));
admin.get('/schedules', wrap(C.listSchedules));
admin.post('/schedules', v(S.schedule), wrap(C.createSchedule));
admin.get('/office', wrap(C.getOffice));
admin.put('/office', v(S.office), wrap(C.setOffice));
admin.get('/reports', v(S.report, 'query'), wrap(C.report));
admin.get('/reports/export.csv', limiter(30, 15), v(S.report, 'query'), wrap(C.reportCsv));
admin.get('/reports/export.pdf', limiter(30, 15), v(S.report, 'query'), wrap(C.reportPdf));
admin.get('/audit-logs', v(S.auditQuery, 'query'), wrap(C.auditLogs));
r.use('/admin', admin);
module.exports = r;
