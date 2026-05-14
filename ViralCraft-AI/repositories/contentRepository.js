/**
 * Thin repository over the Content + Analytics Sequelize models defined in
 * services/database.js. Centralizes data access so routes can stay focused on
 * HTTP concerns. All methods return plain JSON objects (no Sequelize instances).
 */
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

  async search(query) {
    if (!query || typeof query !== 'string') return [];
    const items = await this.findAll({}, { limit: 100 });
    const lower = query.toLowerCase();
    return items.filter((item) => {
      if (!item) return false;
      const haystack = [
        item.title,
        typeof item.content === 'string' ? item.content : JSON.stringify(item.content || ''),
        Array.isArray(item.keywords) ? item.keywords.join(' ') : ''
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(lower);
    });
  }
}

module.exports = new ContentRepository();
