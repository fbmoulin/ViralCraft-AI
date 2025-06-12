
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');

class LightDatabaseService {
  constructor() {
    this.sequelize = null;
    this.models = {};
    this.isConnected = false;
    this.dbPath = path.join(__dirname, '..', 'data', 'viralcraft-light.db');
  }

  async initialize() {
    console.log('💡 Initializing lightweight database...');

    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.dbPath);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Initialize SQLite connection
      this.sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: this.dbPath,
        logging: false,
        pool: {
          max: 5,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      });

      // Test connection
      await this.sequelize.authenticate();
      console.log('✅ Light database connected (SQLite)');

      // Define models
      this.defineModels();

      // Create tables
      await this.sequelize.sync({ alter: false, force: false });

      this.isConnected = true;
      return true;

    } catch (error) {
      console.error('❌ Light database connection failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  defineModels() {
    // Simple Content model for light usage
    this.models.Content = this.sequelize.define('Content', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false
      },
      platform: {
        type: DataTypes.STRING,
        allowNull: false
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false,
        get() {
          const value = this.getDataValue('content');
          return typeof value === 'string' ? JSON.parse(value) : value;
        },
        set(value) {
          this.setDataValue('content', JSON.stringify(value));
        }
      },
      tags: {
        type: DataTypes.TEXT,
        defaultValue: '[]',
        get() {
          const value = this.getDataValue('tags');
          return typeof value === 'string' ? JSON.parse(value) : value;
        },
        set(value) {
          this.setDataValue('tags', JSON.stringify(value));
        }
      },
      score: {
        type: DataTypes.INTEGER,
        defaultValue: 50
      },
      status: {
        type: DataTypes.STRING,
        defaultValue: 'draft'
      }
    });

    // Simple Analytics model
    this.models.Analytics = this.sequelize.define('Analytics', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      contentId: {
        type: DataTypes.UUID,
        allowNull: false
      },
      views: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      interactions: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      date: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      }
    });

    // Define associations
    this.models.Content.hasMany(this.models.Analytics, { 
      foreignKey: 'contentId', 
      as: 'analytics' 
    });
    this.models.Analytics.belongsTo(this.models.Content, { 
      foreignKey: 'contentId', 
      as: 'content' 
    });
  }

  async create(table, data) {
    if (!this.isConnected || !this.models[table]) return null;

    try {
      const record = await this.models[table].create(data);
      return record.toJSON();
    } catch (error) {
      console.error('Light DB create error:', error);
      return null;
    }
  }

  async findAll(table, options = {}) {
    if (!this.isConnected || !this.models[table]) return [];

    try {
      const records = await this.models[table].findAll({
        limit: options.limit || 50,
        offset: options.offset || 0,
        order: [['createdAt', 'DESC']],
        ...options
      });

      return records.map(record => record.toJSON());
    } catch (error) {
      console.error('Light DB query error:', error);
      return [];
    }
  }

  async findById(table, id) {
    if (!this.isConnected || !this.models[table]) return null;

    try {
      const record = await this.models[table].findByPk(id);
      return record ? record.toJSON() : null;
    } catch (error) {
      console.error('Light DB fetch error:', error);
      return null;
    }
  }

  async update(table, id, data) {
    if (!this.isConnected || !this.models[table]) return null;

    try {
      const [updatedRows] = await this.models[table].update(data, {
        where: { id }
      });

      return updatedRows > 0 ? await this.findById(table, id) : null;
    } catch (error) {
      console.error('Light DB update error:', error);
      return null;
    }
  }

  async delete(table, id) {
    if (!this.isConnected || !this.models[table]) return false;

    try {
      const deletedRows = await this.models[table].destroy({
        where: { id }
      });

      return deletedRows > 0;
    } catch (error) {
      console.error('Light DB delete error:', error);
      return false;
    }
  }

  async getStats() {
    if (!this.isConnected) return { connected: false };

    try {
      const contentCount = await this.models.Content.count();
      const analyticsCount = await this.models.Analytics.count();

      return {
        connected: true,
        type: 'SQLite (Light)',
        contentCount,
        analyticsCount,
        dbSize: this.getDbSize()
      };
    } catch (error) {
      return { connected: false, error: error.message };
    }
  }

  getDbSize() {
    try {
      if (fs.existsSync(this.dbPath)) {
        const stats = fs.statSync(this.dbPath);
        return `${(stats.size / 1024).toFixed(2)} KB`;
      }
      return '0 KB';
    } catch (error) {
      return 'Unknown';
    }
  }

  async close() {
    if (this.sequelize) {
      await this.sequelize.close();
      console.log('💡 Light database connection closed');
    }
  }
}

module.exports = new LightDatabaseService();
