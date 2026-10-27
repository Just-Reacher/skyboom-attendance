const test = require('node:test');
const assert = require('node:assert');
const { classifyArrival, recordState, isEarlyDeparture, absenceAllowed, isWorkingDay } = require('../src/utils/rules');
const { verifyLocation, distanceMetres } = require('../src/utils/geo');
const { localParts } = require('../src/utils/time');

const snap = { start_time: '08:00:00', end_time: '17:00:00', grace_minutes: 15 };
const at = (iso) => new Date(iso); // Africa/Accra is UTC+0, so Z == local

test('arrival: on time up to start + grace, late after', () => {
  assert.equal(classifyArrival(snap, at('2026-03-02T08:15:00Z')), 'on_time');
  assert.equal(classifyArrival(snap, at('2026-03-02T08:16:00Z')), 'late');
});
test('grace period comes from the snapshot, not current settings', () => {
  assert.equal(classifyArrival({ ...snap, grace_minutes: 0 }, at('2026-03-02T08:01:00Z')), 'late');
});
test('working day uses ISO weekdays', () => {
  const s = { working_days: [1, 2, 3, 4, 5] };
  assert.equal(isWorkingDay(s, '2026-03-02'), true);  // Monday
  assert.equal(isWorkingDay(s, '2026-03-01'), false); // Sunday
});
test('missing check-out becomes incomplete, never completed', () => {
  const rec = { work_date: '2026-03-02', end_time: '17:00:00', check_out_at: null };
  assert.equal(recordState(rec, at('2026-03-02T12:00:00Z')), 'in_progress');
  assert.equal(recordState(rec, at('2026-03-02T17:00:00Z')), 'incomplete');
  assert.equal(recordState(rec, at('2026-03-03T07:00:00Z')), 'incomplete');
  assert.equal(recordState({ ...rec, check_out_at: '2026-03-02T17:30:00Z' }, at('2026-03-03T07:00:00Z')), 'completed');
});
test('early departure only when policy enabled', () => {
  const rec = { ...snap, check_out_at: '2026-03-02T15:00:00Z', early_departure_enabled: false };
  assert.equal(isEarlyDeparture(rec), false);
  assert.equal(isEarlyDeparture({ ...rec, early_departure_enabled: true }), true);
  assert.equal(isEarlyDeparture({ ...rec, early_departure_enabled: true, check_out_at: '2026-03-02T17:00:00Z' }), false);
});
test('absence only after the deadline on a working day', () => {
  const s = { working_days: [1, 2, 3, 4, 5], absence_deadline: '10:00:00' };
  assert.equal(absenceAllowed(s, '2026-03-02', at('2026-03-02T09:59:00Z')), false);
  assert.equal(absenceAllowed(s, '2026-03-02', at('2026-03-02T10:00:00Z')), true);
  assert.equal(absenceAllowed(s, '2026-03-01', at('2026-03-05T10:00:00Z')), false); // Sunday
  assert.equal(absenceAllowed(null, '2026-03-02'), false);
});
test('geofence: inside, outside, poor accuracy, no office', () => {
  const office = { latitude: 5.6037, longitude: -0.187, radius_m: 100, max_accuracy_m: 50 };
  assert.equal(verifyLocation(office, { latitude: 5.6037, longitude: -0.187, accuracy: 10 }).ok, true);
  const far = verifyLocation(office, { latitude: 5.6137, longitude: -0.187, accuracy: 10 });
  assert.equal(far.code, 'OUTSIDE_GEOFENCE');
  assert.equal(verifyLocation(office, { latitude: 5.6037, longitude: -0.187, accuracy: 500 }).code, 'LOW_ACCURACY');
  assert.equal(verifyLocation(null, { latitude: 0, longitude: 0, accuracy: 1 }).code, 'NO_OFFICE');
  assert.ok(Math.abs(distanceMetres(0, 0, 0, 1) - 111195) < 200);
});
test('local parts use Africa/Accra', () => {
  const p = localParts(at('2026-03-02T08:30:00Z'));
  assert.deepEqual([p.date, p.minutes, p.dow], ['2026-03-02', 510, 1]);
});
