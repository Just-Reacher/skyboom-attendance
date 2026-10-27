const config = require('../config');
exports.notFound = (req, res, next) => {
  if (req.originalUrl.startsWith('/api/')) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } });
  res.status(404).sendFile(require('path').join(__dirname, '../../views/404.html'));
};
// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  let status = err.status || 500, code = err.code, message = err.message, details = err.details;
  if (err.type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'Malformed request body.'; }
  else if (err.code === '23505') { status = 409; code = 'DUPLICATE'; message = 'A record with those details already exists.'; }
  else if (err.code === '23514' || err.code === '23503') { status = 400; code = 'CONSTRAINT'; message = 'Those values are not allowed.'; }
  else if (!err.status) { status = 500; code = 'SERVER_ERROR'; message = 'Something went wrong on our side. Please try again.'; console.error(`[error] ${req.method} ${req.originalUrl}:`, config.isProd ? err.message : err); }
  if (req.originalUrl.startsWith('/api/')) return res.status(status).json({ success: false, error: { code, message, ...(details ? { details } : {}) } });
  res.status(status).sendFile(require('path').join(__dirname, '../../views/error.html'));
};
