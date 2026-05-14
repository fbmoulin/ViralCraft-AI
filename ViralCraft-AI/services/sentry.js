const logger = require('../utils/logger');

let Sentry = null;
let initialized = false;

/**
 * Lazy Sentry wrapper — only loads the SDK if SENTRY_DSN is set, so the package
 * stays an optional dependency. Exposes Express-compatible request and error
 * handlers, plus a `captureException` helper for ad-hoc reporting.
 */
function initialize(app) {
  if (initialized) return Sentry;
  initialized = true;

  if (!process.env.SENTRY_DSN) {
    logger.info('Sentry: SENTRY_DSN not set, error reporting disabled');
    return null;
  }

  try {
    // eslint-disable-next-line global-require
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      release: process.env.SENTRY_RELEASE
    });
    if (app && Sentry.Handlers) {
      app.use(Sentry.Handlers.requestHandler());
    }
    logger.info('Sentry: initialized');
    return Sentry;
  } catch (err) {
    logger.warn('Sentry: SDK not installed, error reporting disabled', { error: err.message });
    Sentry = null;
    return null;
  }
}

function attachErrorHandler(app) {
  if (Sentry && Sentry.Handlers) {
    app.use(Sentry.Handlers.errorHandler());
  }
}

function captureException(err, context = {}) {
  if (Sentry && typeof Sentry.captureException === 'function') {
    Sentry.captureException(err, { extra: context });
  }
}

module.exports = { initialize, attachErrorHandler, captureException };
