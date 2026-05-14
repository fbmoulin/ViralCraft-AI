const { Sequelize, DataTypes } = require('sequelize');
const config = require('../config/app');

class DatabaseService {
  constructor() {
    this.sequelize = null;
    this.models = {};
    this.isConnected = false;
    this.isMigrating = false; // Add a flag to track migration status
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

      // Add SSL for PostgreSQL in production. Strict by default (DB_SSL_STRICT=false to opt-out
      // for self-signed certs in private networks — never disable when connecting over the internet).
      if (!isSqlite && process.env.NODE_ENV === 'production') {
        const strict = (process.env.DB_SSL_STRICT || 'true').toLowerCase() !== 'false';
        options.dialectOptions = {
          ssl: {
            require: true,
            rejectUnauthorized: strict
          }
        };
      }

      this.sequelize = new Sequelize(config.database.url, options);

      // Test connection
      await this.sequelize.authenticate();
      console.log(`✅ Database connected (${isSqlite ? 'SQLite' : 'PostgreSQL'})`);

      // Define models
      this.defineModels(isSqlite);

      // Sync database - replaced with migration handling
      await this.runMigrations();

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
      await this.runMigrations();

      console.log('✅ SQLite fallback initialized');
      this.isConnected = true;
      return true;
    } catch (error) {
      console.error('❌ SQLite fallback failed:', error.message);
      this.isConnected = false;
      return false;
    }
  }

  async runMigrations() {
    // Run migrations with better error handling and loop prevention
    try {
      console.log('📋 Running database migrations...');

      // Check if migrations are already running
      if (this.isMigrating) {
        console.log('⏳ Migrations already in progress, waiting...');
        await new Promise((resolve) => setTimeout(resolve, 1000));
        return true;
      }

      this.isMigrating = true;

      // In non-production, allow auto-altering tables so new columns/indexes
      // added by Sprint 4 (User/Org/Member, Content.orgId) propagate without a
      // manual migration. Production should use a dedicated migration tool.
      const alter = process.env.NODE_ENV !== 'production';
      await this.sequelize.sync({
        alter,
        force: false,
        logging: false
      });

      this.isMigrating = false;
      console.log('✅ Database migrations completed');
    } catch (migrationError) {
      this.isMigrating = false;
      console.error('❌ Migration error:', migrationError.message);
      throw migrationError;
    }
  }

  defineModels(isSqlite) {
    // Content model
    this.models.Content = this.sequelize.define(
      'Content',
      {
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
        // Stores Clerk user IDs (e.g. "user_xxxxx") for ownership filtering.
        userId: {
          type: DataTypes.STRING,
          allowNull: true
        },
        // Optional Clerk organization ID when content belongs to a team.
        orgId: {
          type: DataTypes.STRING,
          allowNull: true
        },
        publishedAt: {
          type: DataTypes.DATE,
          allowNull: true
        }
      },
      {
        indexes: [
          { fields: ['platform'] },
          { fields: ['type'] },
          { fields: ['status'] },
          { fields: ['viralScore'] },
          { fields: ['createdAt'] },
          { fields: ['userId', 'createdAt'] },
          { fields: ['orgId', 'createdAt'] }
        ]
      }
    );

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

    // ─── Multi-user / SaaS schema (Sprint 4) ──────────────────────────
    this.models.User = this.sequelize.define(
      'User',
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        clerkUserId: {
          type: DataTypes.STRING,
          allowNull: false,
          unique: true
        },
        email: {
          type: DataTypes.STRING,
          allowNull: false,
          unique: true,
          validate: { isEmail: true }
        },
        name: {
          type: DataTypes.STRING,
          allowNull: true
        }
      },
      {
        indexes: [{ fields: ['clerkUserId'] }, { fields: ['email'] }]
      }
    );

    this.models.Organization = this.sequelize.define(
      'Organization',
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        clerkOrgId: {
          type: DataTypes.STRING,
          allowNull: false,
          unique: true
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false
        },
        slug: {
          type: DataTypes.STRING,
          allowNull: true
        },
        ownerId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: this.models.User, key: 'id' }
        }
      },
      {
        indexes: [{ fields: ['clerkOrgId'] }, { fields: ['ownerId'] }]
      }
    );

    this.models.OrganizationMember = this.sequelize.define(
      'OrganizationMember',
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        orgId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: this.models.Organization, key: 'id' }
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: { model: this.models.User, key: 'id' }
        },
        role: {
          type: DataTypes.ENUM('owner', 'admin', 'member'),
          defaultValue: 'member',
          allowNull: false
        }
      },
      {
        indexes: [
          { fields: ['orgId'] },
          { fields: ['userId'] },
          { unique: true, fields: ['orgId', 'userId'] }
        ]
      }
    );

    // Define associations
    this.models.Content.hasMany(this.models.Analytics, {
      foreignKey: 'contentId',
      as: 'analytics'
    });
    this.models.Analytics.belongsTo(this.models.Content, {
      foreignKey: 'contentId',
      as: 'content'
    });

    this.models.User.hasMany(this.models.OrganizationMember, {
      foreignKey: 'userId',
      as: 'memberships'
    });
    this.models.Organization.hasMany(this.models.OrganizationMember, {
      foreignKey: 'orgId',
      as: 'members'
    });
    this.models.OrganizationMember.belongsTo(this.models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
    this.models.OrganizationMember.belongsTo(this.models.Organization, {
      foreignKey: 'orgId',
      as: 'organization'
    });
    this.models.User.hasMany(this.models.Organization, {
      foreignKey: 'ownerId',
      as: 'ownedOrganizations'
    });

    // ─── Billing schema (Sprint 5) ─────────────────────────────────────
    this.models.Plan = this.sequelize.define(
      'Plan',
      {
        id: {
          type: DataTypes.STRING,
          primaryKey: true
        },
        name: { type: DataTypes.STRING, allowNull: false },
        stripePriceId: { type: DataTypes.STRING, allowNull: true },
        monthlyAiCalls: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        imageGenerations: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        maxOrgMembers: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        priceCents: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        features: {
          type: isSqlite ? DataTypes.TEXT : DataTypes.JSONB,
          allowNull: true,
          get() {
            const value = this.getDataValue('features');
            return typeof value === 'string' ? JSON.parse(value) : value;
          },
          set(value) {
            this.setDataValue('features', isSqlite ? JSON.stringify(value) : value);
          }
        }
      },
      { timestamps: false }
    );

    this.models.Subscription = this.sequelize.define(
      'Subscription',
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: { model: this.models.User, key: 'id' }
        },
        orgId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: { model: this.models.Organization, key: 'id' }
        },
        planId: {
          type: DataTypes.STRING,
          allowNull: false,
          references: { model: this.models.Plan, key: 'id' }
        },
        stripeCustomerId: { type: DataTypes.STRING, allowNull: true },
        stripeSubscriptionId: { type: DataTypes.STRING, allowNull: true, unique: true },
        status: {
          type: DataTypes.ENUM('active', 'past_due', 'canceled', 'trialing', 'incomplete'),
          allowNull: false,
          defaultValue: 'active'
        },
        currentPeriodEnd: { type: DataTypes.DATE, allowNull: true }
      },
      {
        indexes: [{ fields: ['userId'] }, { fields: ['orgId'] }, { fields: ['stripeCustomerId'] }]
      }
    );

    this.models.ApiUsage = this.sequelize.define(
      'ApiUsage',
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        userId: {
          type: DataTypes.STRING,
          allowNull: false
        },
        orgId: {
          type: DataTypes.STRING,
          allowNull: true
        },
        endpoint: { type: DataTypes.STRING, allowNull: false },
        model: { type: DataTypes.STRING, allowNull: true },
        tokensIn: { type: DataTypes.INTEGER, defaultValue: 0 },
        tokensOut: { type: DataTypes.INTEGER, defaultValue: 0 },
        costUsd: { type: DataTypes.DECIMAL(10, 6), defaultValue: 0 },
        isImage: { type: DataTypes.BOOLEAN, defaultValue: false }
      },
      {
        indexes: [{ fields: ['userId', 'createdAt'] }, { fields: ['orgId', 'createdAt'] }]
      }
    );

    this.models.Plan.hasMany(this.models.Subscription, {
      foreignKey: 'planId',
      as: 'subscriptions'
    });
    this.models.Subscription.belongsTo(this.models.Plan, { foreignKey: 'planId', as: 'plan' });
    this.models.User.hasMany(this.models.Subscription, {
      foreignKey: 'userId',
      as: 'subscriptions'
    });
    this.models.Organization.hasMany(this.models.Subscription, {
      foreignKey: 'orgId',
      as: 'subscriptions'
    });
  }

  // ─── Billing helpers (Sprint 5) ────────────────────────────────────
  async upsertPlan(plan) {
    if (!this.isConnected) return null;
    const [row] = await this.models.Plan.upsert(plan, { returning: true });
    return row.toJSON();
  }

  async getPlan(planId) {
    if (!this.isConnected) return null;
    const row = await this.models.Plan.findByPk(planId);
    return row ? row.toJSON() : null;
  }

  async listPlans() {
    if (!this.isConnected) return [];
    const rows = await this.models.Plan.findAll({ order: [['priceCents', 'ASC']] });
    return rows.map((r) => r.toJSON());
  }

  async findActiveSubscription({ userId, orgId }) {
    if (!this.isConnected) return null;
    const where = orgId ? { orgId } : { userId };
    where.status = ['active', 'trialing', 'past_due'];
    const sub = await this.models.Subscription.findOne({
      where,
      include: [{ model: this.models.Plan, as: 'plan' }],
      order: [['updatedAt', 'DESC']]
    });
    return sub ? sub.toJSON() : null;
  }

  async upsertSubscription({ stripeSubscriptionId, ...rest }) {
    if (!this.isConnected) return null;
    const existing = stripeSubscriptionId
      ? await this.models.Subscription.findOne({ where: { stripeSubscriptionId } })
      : null;
    if (existing) {
      await existing.update(rest);
      return existing.toJSON();
    }
    const created = await this.models.Subscription.create({ stripeSubscriptionId, ...rest });
    return created.toJSON();
  }

  async recordApiUsage(usage) {
    if (!this.isConnected) return null;
    const row = await this.models.ApiUsage.create(usage);
    return row.toJSON();
  }

  async countApiUsage({ userId, orgId, since, isImage = false }) {
    if (!this.isConnected) return 0;
    const where = orgId ? { orgId } : { userId };
    if (since) where.createdAt = { [this.sequelize.constructor.Op.gte]: since };
    where.isImage = isImage;
    return this.models.ApiUsage.count({ where });
  }

  // ─── User / Organization helpers (Sprint 4) ────────────────────────
  async upsertUser({ clerkUserId, email, name }) {
    if (!this.isConnected) return null;
    const [user] = await this.models.User.upsert({ clerkUserId, email, name }, { returning: true });
    return user.toJSON();
  }

  async findUserByClerkId(clerkUserId) {
    if (!this.isConnected) return null;
    const user = await this.models.User.findOne({ where: { clerkUserId } });
    return user ? user.toJSON() : null;
  }

  async deleteUserByClerkId(clerkUserId) {
    if (!this.isConnected) return false;
    const deleted = await this.models.User.destroy({ where: { clerkUserId } });
    return deleted > 0;
  }

  async upsertOrganization({ clerkOrgId, name, slug, ownerId }) {
    if (!this.isConnected) return null;
    const [org] = await this.models.Organization.upsert(
      { clerkOrgId, name, slug, ownerId },
      { returning: true }
    );
    return org.toJSON();
  }

  async findOrgByClerkId(clerkOrgId) {
    if (!this.isConnected) return null;
    const org = await this.models.Organization.findOne({ where: { clerkOrgId } });
    return org ? org.toJSON() : null;
  }

  async addOrgMember({ orgId, userId, role = 'member' }) {
    if (!this.isConnected) return null;
    const [member] = await this.models.OrganizationMember.upsert(
      { orgId, userId, role },
      { returning: true }
    );
    return member.toJSON();
  }

  async findMemberships(userId) {
    if (!this.isConnected) return [];
    const memberships = await this.models.OrganizationMember.findAll({
      where: { userId },
      include: [{ model: this.models.Organization, as: 'organization' }]
    });
    return memberships.map((m) => m.toJSON());
  }

  async assertMembership(userId, orgId) {
    if (!this.isConnected) return null;
    const member = await this.models.OrganizationMember.findOne({ where: { userId, orgId } });
    return member ? member.toJSON() : null;
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

      return contents.map((content) => content.toJSON());
    } catch (error) {
      console.error('Database query error:', error);
      return [];
    }
  }

  async getContentById(id) {
    if (!this.isConnected) return null;

    try {
      const content = await this.models.Content.findByPk(id, {
        include: [
          {
            model: this.models.Analytics,
            as: 'analytics'
          }
        ]
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

      return analytics.map((record) => record.toJSON());
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
