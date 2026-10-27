const ok = (res, data = null, meta, status = 200) => res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { ok, wrap };
