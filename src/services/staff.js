const users = require('../repositories/users');
const audit = require('../repositories/audit');
const db = require('../db');
const { hash } = require('./auth');
const { AppError } = require('../utils/errors');

const snap = (u) => (u ? { staff_no: u.staff_no, full_name: u.full_name, email: u.email, department: u.department, role: u.role, status: u.status } : null);

async function create(admin, input, ip) {
  return db.tx(async (c) => {
    const u = await users.insert({ ...input, password_hash: await hash(input.password) }, c);
    await audit.log({ actorId: admin.id, action: 'staff.created', entity: 'user', entityId: u.id, after: snap(u), ip }, c);
    return u;
  });
}

async function update(admin, id, input, ip) {
  const before = await users.byId(id);
  if (!before) throw new AppError(404, 'NOT_FOUND', 'Staff member not found.');
  if (id === admin.id && (input.status === 'inactive' || (input.role && input.role !== admin.role)))
    throw new AppError(400, 'SELF_CHANGE', 'You cannot deactivate your own account or change your own role.');
  const fields = {};
  for (const k of ['staff_no', 'full_name', 'email', 'department', 'role', 'status']) if (input[k] !== undefined) fields[k] = input[k];
  if (!Object.keys(fields).length) return before;
  return db.tx(async (c) => {
    const after = await users.update(id, fields, c);
    let action = 'staff.updated';
    if (fields.status && fields.status !== before.status) action = fields.status === 'inactive' ? 'staff.deactivated' : 'staff.reactivated';
    else if (fields.role && fields.role !== before.role) action = 'staff.role_changed';
    await audit.log({ actorId: admin.id, action, entity: 'user', entityId: id, before: snap(before), after: snap(after), ip }, c);
    if (fields.status === 'inactive') await users.killSessions(id, c);
    return after;
  });
}

async function resetPassword(admin, id, password, ip) {
  const u = await users.byId(id);
  if (!u) throw new AppError(404, 'NOT_FOUND', 'Staff member not found.');
  await db.tx(async (c) => {
    await users.setPassword(id, await hash(password), true, c);
    await users.killSessions(id, c);
    await audit.log({ actorId: admin.id, action: 'staff.password_reset', entity: 'user', entityId: id, ip }, c);
  });
}
module.exports = { create, update, resetPassword };
