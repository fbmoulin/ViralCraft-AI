const express = require('express');
const request = require('supertest');

const logsRoutes = require('../routes/logs-routes');
const { errorHandler } = require('../middleware/errorHandler');

/**
 * Locks in that `/api/logs/*` rejects unauthenticated requests in production.
 * Previously the entire router was mounted with no auth, exposing
 * lastErrors stacks via GET /api/logs/recent | /errors and on-disk log file
 * names via GET /api/logs/files.
 */
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/logs', logsRoutes);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => errorHandler(err, req, res, next));
  return app;
}

describe('logs-routes — debug-token gating', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.DEBUG_TOKEN;
  });

  it('rejects /api/logs/recent without a debug token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEBUG_TOKEN = 'secret';
    const res = await request(app).get('/api/logs/recent');
    expect(res.status).toBe(401);
  });

  it('rejects /api/logs/errors without a debug token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEBUG_TOKEN = 'secret';
    const res = await request(app).get('/api/logs/errors');
    expect(res.status).toBe(401);
  });

  it('rejects /api/logs/files without a debug token in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEBUG_TOKEN = 'secret';
    const res = await request(app).get('/api/logs/files');
    expect(res.status).toBe(401);
  });

  it('allows authenticated access in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DEBUG_TOKEN = 'secret';
    const res = await request(app).get('/api/logs/recent').set('x-debug-token', 'secret');
    expect(res.status).toBe(200);
  });

  it('returns 503 in production when DEBUG_TOKEN is unset', async () => {
    process.env.NODE_ENV = 'production';
    const res = await request(app).get('/api/logs/recent');
    expect(res.status).toBe(503);
  });

  it('allows access in development without a token', async () => {
    process.env.NODE_ENV = 'development';
    const res = await request(app).get('/api/logs/recent');
    expect(res.status).toBe(200);
  });
});
