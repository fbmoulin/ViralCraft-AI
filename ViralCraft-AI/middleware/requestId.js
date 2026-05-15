const crypto = require('crypto');

const HEADER = 'x-request-id';

/**
 * Attaches a stable request ID to every request. If the upstream caller already
 * sent one (e.g. from a load balancer or another service), we keep it; otherwise
 * we mint a UUID v4. The ID is echoed back on `X-Request-Id` and available as
 * `req.id` so downstream middleware can include it in logs.
 */
function requestId(req, res, next) {
  const incoming = req.get(HEADER);
  const id = incoming && /^[a-zA-Z0-9-]{8,128}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.id = id;
  res.setHeader('X-Request-Id', id);
  next();
}

module.exports = requestId;
