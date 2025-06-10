
const { Sequelize, DataTypes } = require('sequelize');
const config = require('../config/app');

class DatabaseService {
  constructor() {
    this.sequelize = null;
    this.models = {};
    this.isConnected = false;
  }

  async initialize() {
    console.log('📊 Initializing database...');

    try {
      // Determine database type
      const isSqlite = config.database.url.startsWith('sqlite:');
      
      const options = {
        ...config.database.options,
        dialect: isSqlite ? 'sqlite' : 'postgres',
        retry: {
          max: 3,
          timeout: 5000
        },
        pool: {
          max: 10,
          min: 0,
          acquire: 30000,
          idle: 10000
        }
      };

      // Add SSL for PostgreSQL in production
      if (!isSqlite && process.env.NODE_ENV === 'production') {
        options.dialectOptions = {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        };
      }

      this.sequelize = new Sequelize(config.database.url, options);

      // Test connection
      await this.sequelize.authenticate();
      console.log(`✅ Database connected (${isSqlite ? 'SQLite' : 'PostgreSQL'})`);

      // Define models
      this.defineModels(isSqlite);

      // Sync database
      await this.sequelize.sync({ alter: true });
      
      this.isConnected = true;
      return true;

    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      
      // Fallback to SQLite
      if (!config.database.url.startsWith('sqlite:')) {
        console.log('🔄 Falling back to SQLite...');
        return this.initializeSQLiteFallback();
      }
      
      this.isConnected = false;
      return false;
    }
  }

  async initializeSQLiteFallback() {
    try {
      const sqliteUrl = 'sqlite:./soulclap.db';
      this.sequelize = new Sequelize(sqliteUrl, {
        dialect: 'sqlite',
        logging: false
      });

      await this.sequelize.authenticate();
      this.defineModels(true);
      await this.sequelize.sync({ alter: true });
      
      console.log('✅ SQLite fallback initialized');
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('❌ SQLite fallback failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  defineModels(isSqlite) {
    // Content model
    this.models.Content = this.sequelize.define('Content', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          notEmpty: true,
          len: [1, 500]
        }
      },
      type: {
        type: DataTypes.ENUM(...config.content.contentTypes),
        allowNull: false
      },
      platform: {
        type: DataTypes.ENUM(...config.content.platforms, 'universal'),
        allowNull: false
      },
      content: {
        type: isSqlite ? DataTypes.TEXT : DataTypes.JSONB,
        allowNull: false,
        get() {
          const value = this.getDataValue('content');
          return typeof value === 'string' ? JSON.parse(value) : value;
        },
        set(value) {
          this.setDataValue('content', isSqlite ? JSON.stringify(value) : value);
        }
      },
      keywords: {
        type: isSqlite ? DataTypes.TEXT : DataTypes.ARRAY(DataTypes.STRING),
        defaultValue: isSqlite ? '[]' : [],
        get() {
          const value = this.getDataValue('keywords');
          return typeof value === 'string' ? JSON.parse(value) : value;
        },
        set(value) {
          this.setDataValue('keywords', isSqlite ? JSON.stringify(value) : value);
        }
      },
      metadata: {
        type: isSqlite ? DataTypes.TEXT : DataTypes.JSONB,
        defaultValue: isSqlite ? '{}' : {},
        get() {
          const value = this.getDataValue('metadata');
          return typeof value === 'string' ? JSON.parse(value) : value;
        },
        set(value) {
          this.setDataValue('metadata', isSqlite ? JSON.stringify(value) : value);
        }
      },
      viralScore: {
        type: DataTypes.INTEGER,
        defaultValue: 50,
        validate: {
          min: 0,
          max: 100
        }
      },
      status: {
        type: DataTypes.ENUM('draft', 'published', 'scheduled', 'archived'),
        defaultValue: 'draft'
      },
      userId: {
        type: DataTypes.STRING,
        allowNull: true
      },
      publishedAt: {
        type: DataTypes.DATE,
        allowNull: true
      }
    }, {
      indexes: [
        { fields: ['platform'] },
        { fields: ['type'] },
        { fields: ['status'] },
        { fields: ['viralScore'] },
        { fields: ['createdAt'] }
      ]
    });

    // Analytics model
    this.models.Analytics = this.sequelize.define('Analytics', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      contentId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: this.models.Content,
          key: 'id'
        }
      },
      platform: {
        type: DataTypes.ENUM(...config.content.platforms),
        allowNull: false
      },
      views: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      likes: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      shares: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      comments: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      clickThrough: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      engagementRate: {
        type: DataTypes.FLOAT,
        defaultValue: 0
      },
      recordedAt: {
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

  async createContent(data) {
    if (!this.isConnected) return null;

    try {
      const content = await this.models.Content.create({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      return content.toJSON();
    } catch (error) {
      console.error('Database create error:', error);
      throw error;
    }
  }

  async getContent(filters = {}, options = {}) {
    if (!this.isConnected) return [];

    try {
      const { limit = 20, offset = 0, include = [] } = options;

      const contents = await this.models.Content.findAll({
        where: filters,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']],
        include
      });

      return contents.map(content => content.toJSON());
    } catch (error) {
      console.error('Database query error:', error);
      return [];
    }
  }

  async getContentById(id) {
    if (!this.isConnected) return null;

    try {
      const content = await this.models.Content.findByPk(id, {
        include: [{ 
          model: this.models.Analytics, 
          as: 'analytics' 
        }]
      });

      return content ? content.toJSON() : null;
    } catch (error) {
      console.error('Database fetch error:', error);
      return null;
    }
  }

  async updateContent(id, data) {
    if (!this.isConnected) return null;

    try {
      const [updatedRows] = await this.models.Content.update(
        { ...data, updatedAt: new Date() },
        { where: { id } }
      );

      if (updatedRows > 0) {
        return this.getContentById(id);
      }
      return null;
    } catch (error) {
      console.error('Database update error:', error);
      throw error;
    }
  }

  async deleteContent(id) {
    if (!this.isConnected) return false;

    try {
      const deletedRows = await this.models.Content.destroy({
        where: { id }
      });

      return deletedRows > 0;
    } catch (error) {
      console.error('Database delete error:', error);
      return false;
    }
  }

  async getAnalytics(contentId) {
    if (!this.isConnected) return [];

    try {
      const analytics = await this.models.Analytics.findAll({
        where: { contentId },
        order: [['recordedAt', 'DESC']]
      });

      return analytics.map(record => record.toJSON());
    } catch (error) {
      console.error('Database analytics error:', error);
      return [];
    }
  }

  async healthCheck() {
    if (!this.isConnected) {
      return { status: 'disconnected', error: 'Database not connected' };
    }

    try {
      await this.sequelize.authenticate();
      const contentCount = await this.models.Content.count();
      
      return {
        status: 'connected',
        type: this.sequelize.getDialect(),
        contentCount,
        tablesCreated: Object.keys(this.models).length
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }

  async close() {
    if (this.sequelize) {
      await this.sequelize.close();
      console.log('📊 Database connection closed');
    }
  }
}

module.exports = new DatabaseService();
