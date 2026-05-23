const express = require('express');
const request = require('supertest');

// Mock the Clerk SDK BEFORE the route module gets required transitively.
jest.mock('../services/clerk', () => ({
  verifySessionToken: jest.fn(async (token) => {
    if (token === 'alice-token') return { sub: 'user_alice', sid: 'sess_alice' };
    if (token === 'bob-token') return { sub: 'user_bob', sid: 'sess_bob' };
    return null;
  }),
  getUser: jest.fn(),
  getClerk: jest.fn(),
  verifyWebhook: jest.fn()
}));

const contentRoutes = require('../routes/contentRoutes');
const { errorHandler } = require('../middleware/errorHandler');
const requestId = require('../middleware/requestId');

/**
 * Tests the IDOR / auth-bypass fixes for contentRoutes.js. These exercise the
 * route handlers with an in-memory mock `global.db` so we don't need a live
 * SQLite or Postgres in CI.
 */
function makeMockDb(seedRows = []) {
  const rows = new Map(seedRows.map((r) => [r.id, { ...r }]));
  return {
    isConnected: true,
    sequelize: { getDialect: () => 'sqlite' },
    async getContent(filters = {}) {
      return Array.from(rows.values()).filter((r) => {
        if (filters.userId && r.userId !== filters.userId) return false;
        if (filters.orgId && r.orgId !== filters.orgId) return false;
        if (filters.platform && r.platform !== filters.platform) return false;
        return true;
      });
    },
    async getContentById(id) {
      return rows.get(id) || null;
    },
    async createContent(data) {
      const id = data.id || `content-${Math.random().toString(36).slice(2, 8)}`;
      const row = { id, ...data };
      rows.set(id, row);
      return row;
    },
    async updateContent(id, data) {
      if (!rows.has(id)) return null;
      Object.assign(rows.get(id), data);
      return rows.get(id);
    },
    async deleteContent(id) {
      return rows.delete(id) ? 1 : 0;
    },
    findUserByClerkId: jest.fn(),
    findOrgByClerkId: jest.fn(),
    _rows: rows
  };
}

function buildApp(db) {
  global.db = db;
  const app = express();
  app.use(express.json());
  app.use(requestId);
  app.use('/api/content', contentRoutes);
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => errorHandler(err, req, res, next));
  return app;
}

// Two seeded rows: one owned by Alice, one by Bob. Real v4 UUIDs (with the 4
// version nibble and 8-B variant nibble) so express-validator's isUUID passes.
const ALICE_ROW = {
  id: 'aaaaaaaa-aaaa-4aaa-9aaa-aaaaaaaaaaaa',
  title: 'Alice post',
  type: 'post',
  platform: 'instagram',
  content: { text: 'Alice content' },
  keywords: ['alice'],
  metadata: {},
  viralScore: 50,
  status: 'draft',
  userId: 'user_alice',
  orgId: null
};

const BOB_ROW = {
  id: 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb',
  title: 'Bob post',
  type: 'post',
  platform: 'instagram',
  content: { text: 'Bob content' },
  keywords: ['bob'],
  metadata: {},
  viralScore: 50,
  status: 'draft',
  userId: 'user_bob',
  orgId: null
};

describe('contentRoutes — auth & cross-tenant ownership', () => {
  let app;
  let db;

  beforeEach(() => {
    db = makeMockDb([ALICE_ROW, BOB_ROW]);
    app = buildApp(db);
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
    delete global.db;
  });

  describe('PUT /api/content/:id', () => {
    it('rejects anonymous requests with 401', async () => {
      const res = await request(app).put(`/api/content/${BOB_ROW.id}`).send({ title: 'pwned' });
      expect(res.status).toBe(401);
      expect(db._rows.get(BOB_ROW.id).title).toBe('Bob post');
    });

    it('rejects cross-tenant writes with 403', async () => {
      const res = await request(app)
        .put(`/api/content/${BOB_ROW.id}`)
        .set('Authorization', 'Bearer alice-token')
        .send({ title: 'pwned' });
      expect(res.status).toBe(403);
      expect(db._rows.get(BOB_ROW.id).title).toBe('Bob post');
    });

    it('allows the owner to update their own row', async () => {
      const res = await request(app)
        .put(`/api/content/${ALICE_ROW.id}`)
        .set('Authorization', 'Bearer alice-token')
        .send({ title: 'Alice updated' });
      expect(res.status).toBe(200);
      expect(db._rows.get(ALICE_ROW.id).title).toBe('Alice updated');
    });
  });

  describe('DELETE /api/content/:id', () => {
    it('rejects anonymous requests with 401', async () => {
      const res = await request(app).delete(`/api/content/${BOB_ROW.id}`);
      expect(res.status).toBe(401);
      expect(db._rows.has(BOB_ROW.id)).toBe(true);
    });

    it('rejects cross-tenant deletes with 403', async () => {
      const res = await request(app)
        .delete(`/api/content/${BOB_ROW.id}`)
        .set('Authorization', 'Bearer alice-token');
      expect(res.status).toBe(403);
      expect(db._rows.has(BOB_ROW.id)).toBe(true);
    });

    it('allows the owner to delete their own row', async () => {
      const res = await request(app)
        .delete(`/api/content/${ALICE_ROW.id}`)
        .set('Authorization', 'Bearer alice-token');
      expect(res.status).toBe(200);
      expect(db._rows.has(ALICE_ROW.id)).toBe(false);
    });
  });

  describe('POST /api/content/:id/analyze', () => {
    it('rejects anonymous requests with 401', async () => {
      const res = await request(app).post(`/api/content/${BOB_ROW.id}/analyze`);
      expect(res.status).toBe(401);
    });

    it('rejects cross-tenant analyzes with 403', async () => {
      const res = await request(app)
        .post(`/api/content/${BOB_ROW.id}/analyze`)
        .set('Authorization', 'Bearer alice-token');
      expect(res.status).toBe(403);
    });

    it('allows the owner to re-analyze their own row', async () => {
      const res = await request(app)
        .post(`/api/content/${ALICE_ROW.id}/analyze`)
        .set('Authorization', 'Bearer alice-token');
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual(expect.objectContaining({ viralScore: expect.any(Number) }));
    });
  });

  describe('GET /api/content/platform/:platform — cross-tenant scoping', () => {
    it('returns only the caller-owned rows when authenticated', async () => {
      const res = await request(app)
        .get('/api/content/platform/instagram')
        .set('Authorization', 'Bearer alice-token');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(ALICE_ROW.id);
    });

    it('returns an empty list to anonymous callers in production', async () => {
      process.env.NODE_ENV = 'production';
      const res = await request(app).get('/api/content/platform/instagram');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/content/search/:query — cross-tenant scoping', () => {
    it('only matches the caller-owned rows', async () => {
      const res = await request(app)
        .get('/api/content/search/post')
        .set('Authorization', 'Bearer alice-token');
      expect(res.status).toBe(200);
      // db.getContent is filtered by userId via the route's ownership filter,
      // so only Alice's row is fed to the SQL-side LIKE.
      for (const row of res.body.data) {
        expect(row.userId).toBe('user_alice');
      }
    });

    it('returns an empty list to anonymous callers in production', async () => {
      process.env.NODE_ENV = 'production';
      const res = await request(app).get('/api/content/search/post');
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /api/content/:id', () => {
    it('rejects cross-tenant reads with 403', async () => {
      const res = await request(app)
        .get(`/api/content/${BOB_ROW.id}`)
        .set('Authorization', 'Bearer alice-token');
      expect(res.status).toBe(403);
    });
  });
});
