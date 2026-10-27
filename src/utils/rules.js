// Pure attendance rules (no database access) so they are easy to unit test.
const { localParts, dowOfDate, toMinutes } = require('./time');

const isWorkingDay = (schedule, dateStr) => schedule.working_days.map(Number).includes(dowOfDate(dateStr));

// 'late' once local arrival time passes start + grace.
function classifyArrival(snapshot, when) {
  return localParts(when).minutes > toMinutes(snapshot.start_time) + Number(snapshot.grace_minutes) ? 'late' : 'on_time';
}

// A record with no check-out is 'incomplete' once its day (or its end time) has passed.
function recordState(rec, now = new Date()) {
  if (rec.check_out_at) return 'completed';
  const lp = localParts(now);
  if (rec.work_date < lp.date || (rec.work_date === lp.date && lp.minutes >= toMinutes(rec.end_time))) return 'incomplete';
  return 'in_progress';
}

// Only evaluated if the schedule snapshot has the policy switched on.
function isEarlyDeparture(rec) {
  if (!rec.early_departure_enabled || !rec.check_out_at) return false;
  return localParts(new Date(rec.check_out_at)).minutes < toMinutes(rec.end_time);
}

// Absence may be recorded only after the absence deadline on a scheduled working day.
function absenceAllowed(schedule, dateStr, now = new Date()) {
  if (!schedule || !isWorkingDay(schedule, dateStr)) return false;
  const lp = localParts(now);
  return dateStr < lp.date || (dateStr === lp.date && lp.minutes >= toMinutes(schedule.absence_deadline));
}

module.exports = { isWorkingDay, classifyArrival, recordState, isEarlyDeparture, absenceAllowed };
