const { AppError } = require('../utils/errors');
module.exports = (schema, src = 'body') => (req, res, next) => {
  const r = schema.safeParse(req[src]);
  if (!r.success)
    return next(new AppError(400, 'VALIDATION_ERROR', r.error.issues[0].message || 'Invalid input.',
      r.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }))));
  req[src] = r.data;
  next();
};
