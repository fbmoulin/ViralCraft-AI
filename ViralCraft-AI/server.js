require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const config = require('./config/app');
const logger = require('./utils/logger');
const {
  systemMonitoring,
  requestLogging,
  errorTracking,
  getHealthData
} = require('./middleware/monitoring');

// Initialize global error handlers
require('./utils/error-handler');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Logging setup
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => logger.info(message.trim())
    }
  })
);

// Monitoring middleware
app.use(systemMonitoring);
app.use(requestLogging);

// Security middleware — helmet with CSP enabled for production-grade defaults
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': [
          "'self'",
          "'unsafe-inline'",
          'https://*.clerk.accounts.dev',
          'https://*.clerk.com',
          'https://js.stripe.com'
        ],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
        'img-src': ["'self'", 'data:', 'https:', 'blob:'],
        'connect-src': [
          "'self'",
          'https://*.clerk.accounts.dev',
          'https://*.clerk.com',
          'https://api.stripe.com'
        ],
        'frame-src': ["'self'", 'https://js.stripe.com', 'https://hooks.stripe.com']
      }
    },
    crossOriginEmbedderPolicy: false
  })
);
app.use(compression());

// CORS: whitelist explicit origins, no wildcard in production
const corsOrigins =
  config.server.cors.origin === '*'
    ? '*'
    : config.server.cors.origin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins,
    credentials: config.server.cors.credentials
  })
);

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Rate limiters: stricter for AI-intensive routes
const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_PER_MIN || '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please retry in a minute.' }
});
const readRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.READ_RATE_LIMIT_PER_MIN || '100', 10),
  standardHeaders: true,
  legacyHeaders: false
});
// Serve static files with caching headers
const staticOptions = {
  maxAge: process.env.NODE_ENV === 'production' ? '1y' : '1h',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    // Set cache headers based on file type
    if (path.endsWith('.css') || path.endsWith('.js')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // 1 year
    } else if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    }
  }
};

app.use(express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/static', express.static(path.join(__dirname, 'static'), staticOptions));

// Initialize AI services and middleware
const aiService = require('./services/ai');
const apiCache = require('./middleware/apiCache');

const initializeAIServices = async () => {
  try {
    await aiService.initialize();
    global.aiService = aiService;
    logger.info('AI services integration completed');
  } catch (error) {
    logger.error('AI services initialization failed', error);
    global.aiService = aiService; // Still set it for fallback mode
  }
};

// Initialize AI services
initializeAIServices();

// Configuração do Multer para upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'), false);
    }
  }
});

// PostgreSQL with Sequelize setup
let sequelize;
let Content;

// Connect to Database using the database service
const connectDB = async () => {
  try {
    logger.info('Initializing database connection...');

    // Use the database service
    const databaseService = require('./services/database');
    const connected = await databaseService.initialize();

    if (connected) {
      logger.info('Database connected successfully');

      // Set global reference for routes
      global.db = databaseService;

      return true;
    }
    logger.warn('Database connection failed, running in memory mode');
    return false;
  } catch (error) {
    logger.error('Database connection error', error);
    logger.warn('Running without database');
    return false;
  }
};

// API Routes
// API Integration Test Endpoint
app.get('/api/test-integration', async (req, res) => {
  const tests = {
    database: { status: 'unknown', details: '' },
    openai: { status: 'unknown', details: '' },
    anthropic: { status: 'unknown', details: '' },
    youtube: { status: 'unknown', details: '' },
    staticFiles: { status: 'unknown', details: '' }
  };

  // Test Database
  try {
    if (global.db && global.db.isConnected) {
      await global.db.healthCheck();
      tests.database = { status: 'ok', details: 'Connected and responsive' };
    } else {
      tests.database = { status: 'error', details: 'Not connected' };
    }
  } catch (error) {
    tests.database = { status: 'error', details: error.message };
  }

  // Test AI Service
  try {
    if (global.aiService) {
      const aiStatus = global.aiService.getStatus();
      tests.aiService = {
        status: aiStatus.initialized ? 'ok' : 'error',
        details: `OpenAI: ${aiStatus.openai ? '✅' : '❌'}, Fallback: ${aiStatus.fallbackMode ? 'enabled' : 'disabled'}`
      };
    } else {
      tests.aiService = { status: 'error', details: 'AI service not initialized' };
    }
  } catch (error) {
    tests.aiService = { status: 'error', details: error.message };
  }

  // Test Performance Service
  try {
    const performanceService = require('./services/performanceService');
    const healthChecks = await performanceService.runHealthChecks();
    tests.performance = {
      status: 'ok',
      details: `Health: ${JSON.stringify(healthChecks)}`
    };
  } catch (error) {
    tests.performance = { status: 'error', details: error.message };
  }

  // Test YouTube analyzer
  try {
    const YouTubeAnalyzer = require('./utils/youtube-analyzer');
    tests.youtube = { status: 'ok', details: 'YouTube analyzer loaded successfully' };
  } catch (error) {
    tests.youtube = { status: 'error', details: error.message };
  }

  // Test static files
  try {
    const staticCssPath = path.join(__dirname, 'static', 'css', 'modernized-style.css');
    const staticJsPath = path.join(__dirname, 'static', 'js', 'modernized-app.js');

    if (fs.existsSync(staticCssPath) && fs.existsSync(staticJsPath)) {
      tests.staticFiles = { status: 'ok', details: 'Static files accessible' };
    } else {
      tests.staticFiles = { status: 'error', details: 'Static files not found' };
    }
  } catch (error) {
    tests.staticFiles = { status: 'error', details: error.message };
  }

  const overallStatus = Object.values(tests).every((test) => test.status === 'ok')
    ? 'ok'
    : 'partial';

  res.json({
    success: true,
    overallStatus,
    tests,
    timestamp: new Date().toISOString()
  });
});

// Enhanced health check endpoint with monitoring
app.get('/api/health', apiCache(30000), async (req, res) => {
  // Cache for 30 seconds
  try {
    let dbStatus = { connected: false };

    if (global.db && global.db.isConnected) {
      try {
        const healthCheck = await global.db.healthCheck();
        dbStatus = {
          connected: true,
          type: healthCheck.type,
          contentCount: healthCheck.contentCount
        };
      } catch (error) {
        logger.error('Database health check failed', error);
        dbStatus = {
          connected: false,
          error: error.message
        };
      }
    }

    const healthData = getHealthData();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()) + ' seconds',
      memory: healthData.memory,
      cpu: healthData.cpu,
      services: {
        database: dbStatus,
        openai: {
          configured: !!global.openai,
          key: global.openai ? 'valid' : 'missing'
        }
      },
      monitoring: {
        errors: healthData.logs.errors,
        warnings: healthData.logs.warnings,
        lastErrors: healthData.logs.lastErrors
      },
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.2'
    });
  } catch (error) {
    logger.error('Health check endpoint error', error);
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Extract data from files
app.post('/api/extract', aiRateLimiter, upload.single('file'), async (req, res) => {
  try {
    const { type } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!global.openai) {
      return res.status(500).json({ error: 'OpenAI API not configured' });
    }

    let extractedData = '';

    if (file.mimetype.startsWith('image/')) {
      // Process image with OpenAI Vision (gpt-4o supports vision and replaces deprecated gpt-4-vision-preview)
      const base64Image = file.buffer.toString('base64');
      const response = await global.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract all text from this image in a structured format:' },
              {
                type: 'image_url',
                image_url: { url: `data:${file.mimetype};base64,${base64Image}` }
              }
            ]
          }
        ],
        max_tokens: 1000
      });
      extractedData = response.choices[0].message.content;
    } else if (file.mimetype === 'application/pdf') {
      // Simulation of PDF processing
      extractedData = 'Content extracted from PDF (simulation)';
    } else {
      // Process text
      extractedData = file.buffer.toString('utf-8');
    }

    res.json({ success: true, data: extractedData });
  } catch (error) {
    logger.error('Extraction error', error);
    res.status(500).json({ error: 'Error processing file' });
  }
});

// Generate content
app.post('/api/generate', aiRateLimiter, async (req, res) => {
  try {
    const {
      topic,
      contentType,
      platform,
      keywords,
      tone,
      extractedData,
      additionalContext,
      suggestedTitle,
      suggestedContent
    } = req.body;

    // Generate content using AI service
    const result = await global.aiService.generateContent({
      topic,
      contentType,
      platform,
      keywords,
      tone,
      extractedData,
      additionalContext,
      suggestedTitle,
      suggestedContent
    });

    const adaptedContent = {};
    adaptedContent[platform] = result.content;

    // Save to database (if connected)
    try {
      if (global.db && global.db.isConnected) {
        await global.db.createContent({
          title: topic,
          type: contentType,
          platform: platform,
          content: adaptedContent,
          keywords: keywords || [],
          metadata: {
            tone,
            generatedAt: new Date(),
            model: global.anthropic ? 'claude-3-sonnet' : global.openai ? 'gpt-4' : 'mock'
          }
        });
      }
    } catch (dbError) {
      logger.error('Database error while saving generated content', dbError);
      // Continue even with database error
    }

    res.json({
      success: true,
      content: adaptedContent
    });
  } catch (error) {
    logger.error('Generation error', error);
    res.status(500).json({ error: 'Error generating content' });
  }
});

// Fetch saved content

// Suggest content (lightweight preview)
app.post('/api/suggest', aiRateLimiter, async (req, res) => {
  try {
    const { topic, contentType, platform, keywords, tone, extractedData, additionalContext } =
      req.body;

    // Check if AI services are configured
    if (!global.openai && !global.anthropic) {
      return res.status(500).json({
        error:
          'AI services not configured. Configure OPENAI_API_KEY and/or ANTHROPIC_API_KEY in .env'
      });
    }

    // Build prompt for title and summary suggestion
    const systemPrompt = `You are an expert content strategist specializing in viral content creation.
    Your task is to suggest a compelling title and brief content outline that follows the Soulclap template.

    Platform: ${platform}
    Type: ${contentType}
    Tone: ${tone || 'inspiring, accessible and transformative'}`;

    const userPrompt = `
    Topic: ${topic}
    Keywords: ${keywords?.join(', ') || ''}
    ${extractedData ? `\nExtracted data to use as basis:\n${extractedData}` : ''}
    ${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}

    Provide:
    1. A compelling title that would go viral on ${platform}
    2. A brief outline (3-5 bullet points) of what the content should cover
    3. A suggested hook to start the content`;

    let suggestion = {};

    // Generate suggestion using available APIs
    if (global.anthropic) {
      // Use Claude for suggestion
      const response = await global.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: 1000
      });

      suggestion.content = response.content[0].text;
    } else if (global.openai) {
      // Fallback to OpenAI if Anthropic is not available
      const response = await global.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1000
      });

      suggestion.content = response.choices[0].message.content;
    } else {
      // Simulated suggestion if no API is configured
      suggestion.content = `# Suggestion for "${topic}"

**Title:** 7 Segredos Infalíveis sobre ${topic} que Ninguém te Contou

**Outline:**
- O método revolucionário que está transformando ${topic}
- Como aplicar o princípio 80/20 para resultados imediatos
- Ferramentas práticas que você pode implementar hoje mesmo

**Hook:** "O que eu descobri sobre ${topic} mudou completamente minha perspectiva - e vai mudar a sua também."`;
    }

    // Parse the suggestion to extract title, outline and hook
    try {
      const titleMatch = suggestion.content.match(/\*\*Title:\*\*\s*(.*?)(?:\n|$)/);
      const outlineMatch = suggestion.content.match(/\*\*Outline:\*\*([\s\S]*?)(?:\n\n|\*\*|$)/);
      const hookMatch = suggestion.content.match(/\*\*Hook:\*\*\s*(.*?)(?:\n|$)/);

      suggestion.title = titleMatch ? titleMatch[1].trim() : `${topic} - Título Sugerido`;
      suggestion.outline = outlineMatch ? outlineMatch[1].trim() : '';
      suggestion.hook = hookMatch ? hookMatch[1].trim() : '';
    } catch (parseError) {
      logger.warn('Error parsing suggestion', parseError);
      // Use raw content if parsing fails
    }

    res.json({
      success: true,
      suggestion
    });
  } catch (error) {
    logger.error('Suggestion error', error);
    res.status(500).json({ error: 'Error generating suggestion' });
  }
});

// Get all content
app.get('/api/content', async (req, res) => {
  try {
    if (!global.db || !global.db.isConnected) {
      return res.status(404).json({ error: 'Database not connected' });
    }
    const contents = await global.db.getContent();
    res.json({ success: true, contents });
  } catch (error) {
    logger.error('Error fetching content list', error);
    res.status(500).json({ error: 'Error fetching content' });
  }
});

// Real-time error monitoring
app.get('/api/errors/realtime', readRateLimiter, async (req, res) => {
  try {
    const healthData = getHealthData();
    const recentErrors = healthData.logs.lastErrors || [];

    res.json({
      success: true,
      data: {
        totalErrors: healthData.logs.errors,
        totalWarnings: healthData.logs.warnings,
        recentErrors: recentErrors.slice(-5), // Last 5 errors
        systemHealth: {
          memory: healthData.memory,
          uptime: healthData.uptime,
          status: recentErrors.length > 3 ? 'warning' : 'healthy'
        }
      }
    });
  } catch (error) {
    logger.error('Error monitoring endpoint failed', error);
    res.status(500).json({
      success: false,
      error: 'Error retrieving error metrics'
    });
  }
});

// Get content by ID
app.get('/api/content/:id', async (req, res) => {
  try {
    if (!global.db || !global.db.isConnected) {
      return res.status(404).json({ error: 'Database not connected' });
    }
    const content = await global.db.getContentById(req.params.id);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json({ success: true, content });
  } catch (error) {
    logger.error('Error fetching content by id', error);
    res.status(500).json({ error: 'Error fetching content' });
  }
});

// Update content
app.put('/api/content/:id', async (req, res) => {
  try {
    if (!global.db || !global.db.isConnected) {
      return res.status(404).json({ error: 'Database not connected' });
    }
    const updatedContent = await global.db.updateContent(req.params.id, req.body);
    if (!updatedContent) {
      return res.status(404).json({ error: 'Content not found' });
    }
    res.json({ success: true, content: updatedContent });
  } catch (error) {
    logger.error('Error updating content', error);
    res.status(500).json({ error: 'Error updating content' });
  }
});

// Generate image with DALL-E
app.post('/api/generate-image', aiRateLimiter, async (req, res) => {
  try {
    const { prompt, style = 'digital art' } = req.body;
    if (!global.openai) {
      return res.status(500).json({ error: 'OpenAI API not configured' });
    }
    const response = await global.openai.images.generate({
      model: 'dall-e-3',
      prompt: `${prompt}, style: ${style}, high quality, professional`,
      n: 1,
      size: '1024x1024',
      quality: 'hd'
    });
    res.json({
      success: true,
      imageUrl: response.data[0].url
    });
  } catch (error) {
    logger.error('Image generation error', error);
    res.status(500).json({ error: 'Error generating image' });
  }
});

// Initialize routes with error handling
try {
  const youtubeRoutes = require('./routes/youtube-routes');
  app.use('/api/youtube', youtubeRoutes);
  logger.info('YouTube routes initialized');
} catch (error) {
  logger.error('Error initializing YouTube routes', error);
}

try {
  const logsRoutes = require('./routes/logs-routes');
  app.use('/api/logs', logsRoutes);
  logger.info('Logs routes initialized');
} catch (error) {
  logger.error('Error initializing logs routes', error);
}

//Registering debug routes
try {
  const debugRoutes = require('./routes/debug-routes');
  app.use('/api', debugRoutes);
  logger.info('Debug routes initialized');
} catch (error) {
  logger.error('Error initializing debug routes', error);
}

// Default route - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Request logging is already handled by morgan middleware above

// Enhanced error handling middleware
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logger.error('Server error', err);
  const statusCode = err.statusCode || 500;
  const errorResponse = {
    error: statusCode >= 500 ? 'Internal server error' : err.message || 'Bad request'
  };
  // Only expose stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.message = err.message;
    errorResponse.stack = err.stack;
  }
  res.status(statusCode).json(errorResponse);
});

// Error handling middleware (must be last)
app.use(errorTracking);

// Optimized server info logging
const logServerInfo = (port, dbConnected) => {
  const dbType = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.startsWith('sqlite:')
      ? 'SQLite'
      : 'PostgreSQL'
    : 'SQLite';

  logger.info('Viral Content Creator server started', {
    url: `http://0.0.0.0:${port}`,
    environment: process.env.NODE_ENV || 'development',
    database: { type: dbType, connected: dbConnected },
    aiServices: { openai: !!global.openai, anthropic: !!global.anthropic },
    cors: corsOrigins
  });
};

// Optimized server startup with enhanced error handling
const startServer = async () => {
  try {
    logger.info('Starting server initialization');

    // Initialize services in parallel where possible
    const [dbConnected] = await Promise.all([connectDB()]);

    // Warn loudly if running PostgreSQL config but defaulting to SQLite in prod
    if (
      process.env.NODE_ENV === 'production' &&
      (!process.env.DATABASE_URL || process.env.DATABASE_URL.startsWith('sqlite:'))
    ) {
      logger.warn(
        'Production environment using SQLite — use a managed PostgreSQL (e.g., Neon) for multi-user workloads'
      );
    }

    const port = process.env.PORT || 5000;

    const startServerOnPort = async (portToUse, maxRetries = 5) => {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await new Promise((resolve, reject) => {
            const server = app
              .listen(portToUse, '0.0.0.0', () => {
                logServerInfo(portToUse, dbConnected);
                setupGracefulShutdown(server);
                resolve(server);
              })
              .on('error', reject);
          });
        } catch (err) {
          if (err.code === 'EADDRINUSE' && attempt < maxRetries) {
            const nextPort = portToUse + attempt;
            logger.warn(`Port ${portToUse} in use, trying port ${nextPort}`);
            portToUse = nextPort;
          } else {
            throw err;
          }
        }
      }
      throw new Error(`Could not start server after ${maxRetries} attempts`);
    };

    await startServerOnPort(port);
  } catch (error) {
    logger.error('Fatal error starting server', error);
    await gracefulCleanup();
    process.exit(1);
  }
};

// Graceful shutdown handler
function setupGracefulShutdown(server) {
  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, starting graceful shutdown`);

    server.close(async () => {
      logger.info('HTTP server closed');
      await gracefulCleanup();
      process.exit(0);
    });

    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

async function gracefulCleanup() {
  logger.info('Starting cleanup');

  try {
    if (global.db && global.db.close) {
      await global.db.close();
      logger.info('Database connections closed');
    }

    logger.info('Cleanup completed');
  } catch (error) {
    logger.error('Error during cleanup', error);
  }
}

logger.info('Starting ViralCraft-AI server', {
  nodeVersion: process.version,
  cwd: process.cwd(),
  environment: process.env.NODE_ENV || 'development'
});

startServer();

module.exports = app; // Export for testing
