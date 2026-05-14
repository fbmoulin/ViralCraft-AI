const { requireDebugToken } = require('../middleware/requireDebugToken');

function makeReqRes(headers = {}, env = {}) {
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);

  const req = {
    get: (name) => headers[name.toLowerCase()],
    path: '/api/debug',
    ip: '127.0.0.1'
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  const next = jest.fn();

  return {
    req,
    res,
    next,
    restore: () => {
      process.env = originalEnv;
    }
  };
}

describe('requireDebugToken middleware', () => {
  afterEach(() => {
    delete process.env.NODE_ENV;
    delete process.env.DEBUG_TOKEN;
  });

  it('lets requests through in non-production even without token', () => {
    const { req, res, next, restore } = makeReqRes({}, { NODE_ENV: 'development' });
    requireDebugToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    restore();
  });

  it('returns 503 in production when DEBUG_TOKEN is unset', () => {
    const { req, res, next, restore } = makeReqRes({}, { NODE_ENV: 'production' });
    requireDebugToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
    restore();
  });

  it('returns 401 in production when token is missing', () => {
    const { req, res, next, restore } = makeReqRes(
      {},
      { NODE_ENV: 'production', DEBUG_TOKEN: 'secret' }
    );
    requireDebugToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    restore();
  });

  it('returns 401 in production when token is wrong', () => {
    const { req, res, next, restore } = makeReqRes(
      { 'x-debug-token': 'wrong' },
      { NODE_ENV: 'production', DEBUG_TOKEN: 'secret' }
    );
    requireDebugToken(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    restore();
  });

  it('allows the request through when the token matches', () => {
    const { req, res, next, restore } = makeReqRes(
      { 'x-debug-token': 'secret' },
      { NODE_ENV: 'production', DEBUG_TOKEN: 'secret' }
    );
    requireDebugToken(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    restore();
  });
});
