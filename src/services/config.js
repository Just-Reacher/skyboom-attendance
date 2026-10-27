const schedules = require('../repositories/schedules');
const offices = require('../repositories/offices');
const audit = require('../repositories/audit');
const db = require('../db');
const { localParts } = require('../utils/time');
const { AppError } = require('../utils/errors');

async function createSchedule(admin, input, ip) {
  if (input.effective_from < localParts().date)
    throw new AppError(400, 'PAST_EFFECTIVE_DATE', 'A new schedule must take effect today or later so historical results are not rewritten.');
  return db.tx(async (c) => {
    const s = await schedules.insert({ ...input, created_by: admin.id }, c);
    await audit.log({ actorId: admin.id, action: 'schedule.created', entity: 'work_schedule', entityId: s.id, before: null, after: s, ip }, c); // new row; older schedules are never edited
    return s;
  });
}

async function setOffice(admin, input, reason, ip) {
  return db.tx(async (c) => {
    const before = await offices.active(c);
    await offices.deactivateAll(c);
    const o = await offices.insert({ ...input, created_by: admin.id }, c);
    await audit.log({ actorId: admin.id, action: 'geofence.updated', entity: 'office_location', entityId: o.id, reason, before: before || null, after: o, ip }, c);
    return o;
  });
}
module.exports = { createSchedule, setOffice };
