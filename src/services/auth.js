const bcrypt = require('bcryptjs');
const users = require('../repositories/users');
const audit = require('../repositories/audit');
const { AppError } = require('../utils/errors');

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 12);
const invalid = () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.');
const hash = (pw) => bcrypt.hash(pw, 12);

async function login(email, password, ip) {
  const u = await users.byEmailWithHash(email);
  if (!u) { await bcrypt.compare(password, DUMMY_HASH); throw invalid(); }
  if (u.locked_until && new Date(u.locked_until) > new Date())
    throw new AppError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again in 15 minutes or ask an administrator to reset your password.');
  if (!(await bcrypt.compare(password, u.password_hash))) {
    const r = await users.recordFailure(u.id);
    if (r.locked_until && r.failed_login_count === 0)
      await audit.log({ actorId: u.id, action: 'security.account_locked', entity: 'user', entityId: u.id, ip });
    throw invalid();
  }
  if (u.status !== 'active') throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account has been deactivated. Contact an administrator.');
  await users.recordSuccess(u.id);
  return users.byId(u.id);
}

async function changePassword(userId, current, next, ip) {
  if (!(await bcrypt.compare(current, await users.hashById(userId)))) throw new AppError(400, 'WRONG_PASSWORD', 'Your current password is incorrect.');
  if (current === next) throw new AppError(400, 'SAME_PASSWORD', 'Choose a password different from your current one.');
  await users.setPassword(userId, await hash(next), false);
  await audit.log({ actorId: userId, action: 'security.password_changed', entity: 'user', entityId: userId, ip });
}
module.exports = { login, changePassword, hash };
