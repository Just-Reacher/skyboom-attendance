const db = require('../db');
const attendance = require('../repositories/attendance');
const schedules = require('../repositories/schedules');
const offices = require('../repositories/offices');
const exceptions = require('../repositories/exceptions');
const audit = require('../repositories/audit');
const users = require('../repositories/users');
const { localParts, toMinutes } = require('../utils/time');
const { isWorkingDay, classifyArrival, absenceAllowed } = require('../utils/rules');
const { verifyLocation } = require('../utils/geo');
const { AppError } = require('../utils/errors');

const locFail = (v) => new AppError(422, v.code, v.message);
const snapshotOf = (s) => ({ schedule_id: s.id, start_time: s.start_time, end_time: s.end_time, grace_minutes: s.grace_minutes, early_departure_enabled: s.early_departure_enabled });
const pick = (r) => ({ check_in_at: r.check_in_at, check_out_at: r.check_out_at, status: r.status });

// ---- staff: today's state --------------------------------------------------
async function today(user) {
  const now = new Date(), lp = localParts(now);
  const [schedule, office, record] = await Promise.all([schedules.forDate(lp.date), offices.active(), attendance.find(user.id, lp.date)]);
  let canCheckIn = false, canCheckOut = false, reason = null;
  if (!schedule) reason = 'No work schedule is configured. Contact an administrator.';
  else if (!isWorkingDay(schedule, lp.date) && !record) reason = 'Today is not a scheduled working day.';
  else if (!office) reason = 'The office location has not been configured yet. Contact an administrator.';
  else if (!record) {
    if (lp.minutes >= toMinutes(schedule.end_time)) reason = 'Working hours have ended. If you worked today, submit an exception request below.';
    else canCheckIn = true;
  } else if (!record.check_out_at) canCheckOut = true;
  else reason = 'You have completed your attendance for today.';
  return { now: now.toISOString(), work_date: lp.date, record: record || null, canCheckIn, canCheckOut, reason,
    schedule: schedule && { start_time: schedule.start_time, end_time: schedule.end_time, grace_minutes: schedule.grace_minutes }, officeConfigured: !!office };
}

// ---- staff: check in / out -------------------------------------------------
async function checkIn(user, loc) {
  const now = new Date(), lp = localParts(now);
  const schedule = await schedules.forDate(lp.date);
  if (!schedule) throw new AppError(409, 'NO_SCHEDULE', 'No work schedule is configured.');
  if (!isWorkingDay(schedule, lp.date)) throw new AppError(409, 'NOT_WORKING_DAY', 'Today is not a scheduled working day.');
  if (lp.minutes >= toMinutes(schedule.end_time)) throw new AppError(409, 'AFTER_HOURS', 'Working hours have ended. Submit an exception request instead.');
  const v = verifyLocation(await offices.active(), loc);
  if (!v.ok) throw locFail(v);
  const created = await db.tx((c) => attendance.insert({
    user_id: user.id, work_date: lp.date, check_in_at: now, status: classifyArrival(schedule, now), source: 'self',
    ...snapshotOf(schedule), distance: v.distance, accuracy: loc.accuracy, location_result: v.code }, c));
  if (!created) throw new AppError(409, 'ALREADY_CHECKED_IN', 'You have already checked in today.');
  return attendance.find(user.id, lp.date);
}

async function checkOut(user, loc) {
  const now = new Date(), lp = localParts(now);
  const v = verifyLocation(await offices.active(), loc);
  if (!v.ok) throw locFail(v);
  await db.tx(async (c) => {
    const rec = await attendance.find(user.id, lp.date, c, true); // row lock prevents double check-out
    if (!rec) throw new AppError(409, 'NOT_CHECKED_IN', 'You have not checked in today, so you cannot check out.');
    if (rec.check_out_at) throw new AppError(409, 'ALREADY_CHECKED_OUT', 'You have already checked out today.');
    await attendance.setCheckOut(rec.id, now, { distance: v.distance, accuracy: loc.accuracy, result: v.code }, c);
  });
  return attendance.find(user.id, lp.date);
}

// ---- staff: exception requests --------------------------------------------
async function requestException(user, { work_date, type, reason }) {
  const lp = localParts();
  const earliest = new Date(Date.now() - 7 * 864e5); const min = localParts(earliest).date;
  if (work_date > lp.date || work_date < min) throw new AppError(400, 'BAD_DATE', 'Exception requests cover today and the previous 7 days only.');
  const rec = await attendance.find(user.id, work_date);
  if (type === 'check_in' && rec) throw new AppError(409, 'RECORD_EXISTS', 'You already have attendance for that day.');
  if (type === 'check_out' && (!rec || rec.check_out_at)) throw new AppError(409, 'NOTHING_TO_FIX', 'There is no open check-in for that day.');
  return exceptions.insert({ user_id: user.id, work_date, type, reason });
}

async function reviewException(admin, id, { decision, note, time }, ip) {
  return db.tx(async (c) => {
    const ex = await exceptions.byId(id, c, true);
    if (!ex) throw new AppError(404, 'NOT_FOUND', 'Request not found.');
    if (ex.status !== 'pending') throw new AppError(409, 'ALREADY_REVIEWED', 'This request has already been reviewed.');
    let attendanceId = null, after = null;
    if (decision === 'approve') {
      if (!time) throw new AppError(400, 'TIME_REQUIRED', 'Enter the verified time to record.');
      const when = new Date(time);
      if (localParts(when).date !== ex.work_date) throw new AppError(400, 'BAD_TIME', 'The time must fall on the requested work date.');
      if (when > new Date()) throw new AppError(400, 'BAD_TIME', 'The time cannot be in the future.');
      if (ex.type === 'check_in') {
        const schedule = await schedules.forDate(ex.work_date, c);
        if (!schedule) throw new AppError(409, 'NO_SCHEDULE', 'No schedule applies to that date.');
        const row = await attendance.insert({ user_id: ex.user_id, work_date: ex.work_date, check_in_at: when, status: classifyArrival(schedule, when),
          source: 'exception', ...snapshotOf(schedule), location_result: 'exception_approved' }, c);
        if (!row) throw new AppError(409, 'RECORD_EXISTS', 'Attendance already exists for that day.');
        attendanceId = row.id;
      } else {
        const rec = await attendance.find(ex.user_id, ex.work_date, c, true);
        if (!rec || rec.check_out_at || when <= new Date(rec.check_in_at)) throw new AppError(409, 'CANNOT_APPLY', 'Cannot apply: no open check-in, or time is before check-in.');
        await attendance.setCheckOutException(rec.id, when, c);
        attendanceId = rec.id;
      }
      after = { type: ex.type, time: when.toISOString(), work_date: ex.work_date };
    }
    await exceptions.review(id, admin.id, decision === 'approve' ? 'approved' : 'rejected', note, attendanceId, c);
    await audit.log({ actorId: admin.id, action: `exception.${decision === 'approve' ? 'approved' : 'rejected'}`, entity: 'attendance_exception', entityId: id,
      reason: note, before: { requested_by: ex.staff_no, staff_reason: ex.reason, type: ex.type, work_date: ex.work_date }, after, ip }, c);
  });
}

// ---- admin: create / correct records --------------------------------------
async function validateTimes(work_date, inAt, outAt) {
  if (localParts(inAt).date !== work_date) throw new AppError(400, 'BAD_TIME', 'Check-in must fall on the work date.');
  if (outAt && (outAt <= inAt || localParts(outAt).date !== work_date)) throw new AppError(400, 'BAD_TIME', 'Check-out must be after check-in on the same date.');
  if (inAt > new Date() || (outAt && outAt > new Date())) throw new AppError(400, 'BAD_TIME', 'Times cannot be in the future.');
}

async function adminCreate(admin, { user_id, work_date, check_in_at, check_out_at, reason }, ip) {
  const inAt = new Date(check_in_at), outAt = check_out_at ? new Date(check_out_at) : null;
  await validateTimes(work_date, inAt, outAt);
  return db.tx(async (c) => {
    const u = await users.byId(user_id, c);
    if (!u || u.role !== 'staff') throw new AppError(404, 'NOT_FOUND', 'Staff member not found.');
    const schedule = await schedules.forDate(work_date, c);
    if (!schedule) throw new AppError(409, 'NO_SCHEDULE', 'No schedule applies to that date.');
    const row = await attendance.insert({ user_id, work_date, check_in_at: inAt, check_out_at: outAt, status: classifyArrival(schedule, inAt),
      source: 'correction', ...snapshotOf(schedule), location_result: 'admin_entered' }, c);
    if (!row) throw new AppError(409, 'RECORD_EXISTS', 'A record already exists for that staff member and date. Edit it instead.');
    const after = await attendance.byId(row.id, c);
    await audit.log({ actorId: admin.id, action: 'attendance.created_by_admin', entity: 'attendance', entityId: row.id, reason, before: null, after: pick(after), ip }, c);
    return after;
  });
}

async function adminCorrect(admin, id, input, ip) {
  return db.tx(async (c) => {
    const rec = await attendance.byId(id, c, true);
    if (!rec) throw new AppError(404, 'NOT_FOUND', 'Attendance record not found.');
    const inAt = input.check_in_at ? new Date(input.check_in_at) : new Date(rec.check_in_at);
    const outAt = input.check_out_at === undefined ? (rec.check_out_at ? new Date(rec.check_out_at) : null) : input.check_out_at ? new Date(input.check_out_at) : null;
    await validateTimes(rec.work_date, inAt, outAt);
    const next = { check_in_at: inAt, check_out_at: outAt, status: classifyArrival(rec, inAt) }; // uses the record's own schedule snapshot
    await attendance.correct(id, next, c);
    await audit.log({ actorId: admin.id, action: 'attendance.corrected', entity: 'attendance', entityId: id, reason: input.reason,
      before: pick(rec), after: { check_in_at: inAt.toISOString(), check_out_at: outAt && outAt.toISOString(), status: next.status }, ip }, c);
    return attendance.byId(id, c);
  });
}

// ---- admin: dashboard -------------------------------------------------------
async function overview(date) {
  const lp = localParts();
  const [activeStaff, s, absent, pending, recent] = await Promise.all([
    users.countActiveStaff(), attendance.summary(date), attendance.absences({ from: date, to: date }), exceptions.pendingCount(), attendance.recent(10)]);
  return { date, is_today: date === lp.date, total_active_staff: activeStaff, checked_in: s.checked_in, late: s.late, incomplete: s.incomplete,
    absent: absent.length, pending_exceptions: pending, recent };
}
module.exports = { today, checkIn, checkOut, requestException, reviewException, adminCreate, adminCorrect, overview };
