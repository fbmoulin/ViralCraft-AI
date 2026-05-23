/**
 * Thin repository over the Content + Analytics Sequelize models defined in
 * services/database.js. Centralizes data access so routes can stay focused on
 * HTTP concerns. All methods return plain JSON objects (no Sequelize instances).
 */
const { Op } = require('sequelize');

class ContentRepository {
  get db() {
    return global.db;
  }

  ensureConnected() {
    if (!this.db || !this.db.isConnected) {
      const err = new Error('Database not connected');
      err.statusCode = 503;
      throw err;
    }
  }

  async findAll(filters = {}, options = {}) {
    this.ensureConnected();
    const limit = Math.min(parseInt(options.limit ?? 20, 10) || 20, 100);
    const offset = parseInt(options.offset ?? 0, 10) || 0;
    return this.db.getContent(filters, { limit, offset, include: options.include || [] });
  }

  async findById(id) {
    this.ensureConnected();
    return this.db.getContentById(id);
  }

  async create(data) {
    this.ensureConnected();
    return this.db.createContent(data);
  }

  async update(id, data) {
    this.ensureConnected();
    return this.db.updateContent(id, data);
  }

  async delete(id) {
    this.ensureConnected();
    return this.db.deleteContent(id);
  }

  async findByPlatform(platform) {
    return this.findAll({ platform });
  }

  /**
   * Ownership-scoped, SQL-side substring search across title and the JSON
   * content column. The previous `search()` loaded 100 rows across all tenants
   * and filtered in JS — a cross-tenant data leak. Callers must pass the
   * ownership filter from `ownershipFilter(req)` in routes/contentRoutes.js.
   *
   * Uses `Op.iLike` on Postgres for case-insensitive match; falls back to
   * `Op.like` on SQLite (case-insensitive by default for ASCII).
   */
  async searchScoped(query, ownership = {}) {
    if (!query || typeof query !== 'string') return [];
    this.ensureConnected();

    const dialect = this.db.sequelize?.getDialect?.() || 'sqlite';
    const likeOp = dialect === 'postgres' ? Op.iLike : Op.like;
    const needle = `%${query.replace(/[%_\\]/g, '\\$&')}%`;

    const where = {
      ...ownership,
      [Op.or]: [{ title: { [likeOp]: needle } }, { content: { [likeOp]: needle } }]
    };

    return this.db.getContent(where, { limit: 50, offset: 0, include: [] });
  }

  /**
   * Backwards-compatible wrapper retained only so legacy callers don't blow up.
   * New code MUST use `searchScoped` with an ownership filter — this version
   * returns nothing rather than leaking other tenants' rows.
   */
  async search(_query) {
    return [];
  }
}

module.exports = new ContentRepository();
