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
const logger = require('./utils/logger');
const { systemMonitoring, requestLogging, errorTracking, getHealthData } = require('./middleware/monitoring');

// Initialize global error handlers
require('./utils/error-handler');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Logging setup
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Monitoring middleware
app.use(systemMonitoring);
app.use(requestLogging);

// Security and compression middleware
// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
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
const aiService = require('./services/enhancedAI');
const apiCache = require('./middleware/apiCache');

const initializeAIServices = async () => {
  try {
    await aiService.initialize();
    global.aiService = aiService;
    console.log('✅ AI services integration completed');
  } catch (error) {
    console.error('❌ AI services initialization failed:', error.message);
    global.aiService = aiService; // Still set it for fallback mode
  }
};

// Initialize AI services
initializeAIServices();

// Configuração do Multer para upload de arquivos
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
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

// Initialize Integration Manager with all services
const integrationManager = require('./services/integrationManager');
const databaseService = require('./services/database');
const lightDatabaseService = require('./services/lightDatabase');
const cacheService = require('./services/cacheService');
const performanceService = require('./services/performanceService');

const initializeServices = async () => {
  try {
    console.log('🔧 Initializing all services with Integration Manager...');

    // Register Database Service
    integrationManager.registerService('database', databaseService, {
      healthCheck: async () => {
        if (!databaseService.isConnected) throw new Error('Database not connected');
        return await databaseService.healthCheck();
      },
      retryPolicy: { maxRetries: 3, backoffMs: 2000 },
      circuitBreaker: { threshold: 3, resetTimeMs: 60000 },
      fallback: async (...args) => {
        console.log('🔄 Falling back to light database...');
        if (!lightDatabaseService.isConnected) {
          await lightDatabaseService.initialize();
        }
        return lightDatabaseService;
      },
      critical: false,
      timeout: 15000
    });

    // Register Light Database Service
    integrationManager.registerService('lightDatabase', lightDatabaseService, {
      healthCheck: async () => {
        if (!lightDatabaseService.isConnected) throw new Error('Light database not connected');
        return await lightDatabaseService.getStats();
      },
      retryPolicy: { maxRetries: 2, backoffMs: 1000 },
      circuitBreaker: { threshold: 5, resetTimeMs: 30000 },
      critical: false,
      timeout: 10000
    });

    // Register AI Service
    integrationManager.registerService('ai', aiService, {
      healthCheck: async () => {
        const status = aiService.getStatus();
        if (!status.initialized) throw new Error('AI service not initialized');
        return status;
      },
      retryPolicy: { maxRetries: 2, backoffMs: 3000 },
      circuitBreaker: { threshold: 5, resetTimeMs: 120000 },
      fallback: async (params) => {
        console.log('🔄 Using AI service fallback mode...');
        return aiService.generateWithFallback(params);
      },
      critical: false,
      timeout: 45000
    });

    // Register Cache Service
    integrationManager.registerService('cache', cacheService, {
      healthCheck: async () => {
        return cacheService.isHealthy();
      },
      retryPolicy: { maxRetries: 1, backoffMs: 500 },
      circuitBreaker: { threshold: 10, resetTimeMs: 30000 },
      fallback: async () => {
        console.log('🔄 Cache service unavailable, proceeding without cache...');
        return null;
      },
      critical: false,
      timeout: 5000
    });

    // Register Performance Service
    integrationManager.registerService('performance', performanceService, {
      healthCheck: async () => {
        return await performanceService.runHealthChecks();
      },
      retryPolicy: { maxRetries: 1, backoffMs: 1000 },
      circuitBreaker: { threshold: 5, resetTimeMs: 60000 },
      critical: false,
      timeout: 10000
    });

    // Initialize all services
    await integrationManager.initialize();

    // Set global references with resilient wrappers
    global.db = integrationManager.getService('database');
    global.lightDb = integrationManager.getService('lightDatabase');
    global.aiService = integrationManager.getService('ai');
    global.cacheService = integrationManager.getService('cache');
    global.performanceService = integrationManager.getService('performance');
    global.integrationManager = integrationManager;

    console.log('✅ All services initialized with Integration Manager');
    return true;

  } catch (error) {
    console.error('❌ Service initialization failed:', error.message);
    
    // Try to initialize critical services individually
    try {
      console.log('🔄 Attempting fallback initialization...');
      
      // Initialize at least light database for basic functionality
      if (!lightDatabaseService.isConnected) {
        await lightDatabaseService.initialize();
        global.db = lightDatabaseService;
        console.log('✅ Fallback to light database successful');
      }

      // Initialize AI service in fallback mode
      if (!global.aiService) {
        await aiService.initialize();
        global.aiService = aiService;
        console.log('✅ AI service initialized in fallback mode');
      }

      return true;
    } catch (fallbackError) {
      console.error('❌ Fallback initialization also failed:', fallbackError.message);
      console.warn('⚠️ Running in minimal mode without database and AI services');
      return false;
    }
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
        details: `OpenAI: ${aiStatus.openai ? '✅' : '❌'} (Anthropic disabled), Fallback: ${aiStatus.fallbackMode ? 'enabled' : 'disabled'}` 
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

  const overallStatus = Object.values(tests).every(test => test.status === 'ok') ? 'ok' : 'partial';

  res.json({
    success: true,
    overallStatus,
    tests,
    timestamp: new Date().toISOString()
  });
});

// Enhanced health check endpoint with monitoring
app.get('/api/health', apiCache(30000), async (req, res) => { // Cache for 30 seconds
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
        },
        anthropic: {
          configured: !!global.anthropic,
          key: global.anthropic ? 'valid' : 'missing'
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
app.post('/api/extract', upload.single('file'), async (req, res) => {
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
      // Process image with OpenAI Vision
      const base64Image = file.buffer.toString('base64');
      const response = await global.openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all text from this image in a structured format:" },
              { type: "image_url", image_url: { url: `data:${file.mimetype};base64,${base64Image}` } }
            ]
          }
        ],
        max_tokens: 1000
      });
      extractedData = response.choices[0].message.content;
    } else if (file.mimetype === 'application/pdf') {
      // Simulation of PDF processing
      extractedData = "Content extracted from PDF (simulation)";
    } else {
      // Process text
      extractedData = file.buffer.toString('utf-8');
    }

    res.json({ success: true, data: extractedData });
  } catch (error) {
    console.error('Extraction error:', error);
    res.status(500).json({ error: 'Error processing file', details: error.message });
  }
});

// Generate content
app.post('/api/generate', async (req, res) => {
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
            model: global.anthropic ? 'claude-3-sonnet' : (global.openai ? 'gpt-4' : 'mock')
          }
        });
      }
    } catch (dbError) {
      console.error('Database error:', dbError);
      // Continue even with database error
    }

    res.json({ 
      success: true, 
      content: adaptedContent
    });

  } catch (error) {
    console.error('Generation error:', error);
    res.status(500).json({ error: 'Error generating content', details: error.message });
  }
});

// Fetch saved content

// Suggest content (lightweight preview)
app.post('/api/suggest', async (req, res) => {
  try {
    const { 
      topic, 
      contentType, 
      platform, 
      keywords, 
      tone, 
      extractedData,
      additionalContext 
    } = req.body;

    // Use AI service for content generation
    try {
      const result = await aiService.generateContent({
        topic,
        contentType: type,
        platform,
        tone,
        keywords,
        extractedData,
        additionalContext
      });

      return res.json({
        content: result.content,
        provider: result.provider,
        model: result.model,
        tokensUsed: result.tokensUsed || 0
      });
    } catch (error) {
      logger.error('Content generation failed:', error);
      return res.status(500).json({
        error: 'Error generating content',
        details: error.message
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

    // Generate suggestion using AI service
    try {
      const result = await aiService.generateContent({
        topic,
        contentType,
        platform,
        tone,
        keywords,
        extractedData,
        additionalContext
      });

      // Parse the suggestion from the generated content
      const lines = result.content.split('\n');
      suggestion = {
        title: lines.find(line => line.includes('Título') || line.includes('Title'))?.replace(/.*[:：]/, '').trim() || topic,
        outline: lines.filter(line => line.includes('•') || line.includes('-') || line.includes('1.')).slice(0, 5),
        hook: lines.find(line => line.includes('Hook') || line.includes('Abertura'))?.replace(/.*[:：]/, '').trim() || `Descubra os segredos de ${topic}`,
        provider: result.provider
      };
    } catch (error) {
      logger.error('Suggestion generation failed:', error);
      // Fallback suggestion
      suggestion = {
        title: `${topic} - Guia Completo`,
        outline: [
          `• Introdução ao ${topic}`,
          `• Principais benefícios`,
          `• Como implementar`,
          `• Dicas práticas`,
          `• Próximos passos`
        ],
        hook: `Você não vai acreditar no que descobrimos sobre ${topic}!`,
        provider: 'fallback'
      };
    } else if (global.openai) {
      // Fallback to OpenAI if Anthropic is not available
      const response = await global.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
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
      console.warn('Error parsing suggestion:', parseError);
      // Use raw content if parsing fails
    }

    res.json({ 
      success: true, 
      suggestion
    });

  } catch (error) {
    console.error('Suggestion error:', error);
    res.status(500).json({ error: 'Error generating suggestion', details: error.message });
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
    res.status(500).json({ error: 'Error fetching content', details: error.message });
  }
});

// Real-time error monitoring
app.get('/api/errors/realtime', async (req, res) => {
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
    console.error('Error monitoring endpoint failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
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
    res.status(500).json({ error: 'Error fetching content', details: error.message });
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
    res.status(500).json({ error: 'Error updating content', details: error.message });
  }
});

// Generate image with DALL-E
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt, style = 'digital art' } = req.body;
    if (!global.openai) {
      return res.status(500).json({ error: 'OpenAI API not configured' });
    }
    const response = await global.openai.images.generate({
      model: "dall-e-3",
      prompt: `${prompt}, style: ${style}, high quality, professional`,
      n: 1,
      size: "1024x1024",
      quality: "hd"
    });
    res.json({ 
      success: true, 
      imageUrl: response.data[0].url 
    });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Error generating image', details: error.message });
  }
});

// Initialize routes with error handling
try {
  const youtubeRoutes = require('./routes/youtube-routes');
  app.use('/api/youtube', youtubeRoutes);
  console.log('✅ YouTube routes initialized');
} catch (error) {
  console.error('❌ Error initializing YouTube routes:', error.message);
}

try {
  const logsRoutes = require('./routes/logs-routes');
  app.use('/api/logs', logsRoutes);
  console.log('✅ Logs routes initialized');
} catch (error) {
  console.error('❌ Error initializing logs routes:', error.message);
}

//Registering debug routes
try {
  const debugRoutes = require('./routes/debug-routes');
  app.use('/api', debugRoutes);
  console.log('✅ Debug routes initialized');
} catch (error) {
  console.error('❌ Error initializing debug routes:', error.message);
}

// Register health check routes
try {
  const healthRoutes = require('./routes/healthcheck-routes');
  app.use('/api', healthRoutes);
  console.log('✅ Health check routes initialized');
} catch (error) {
  console.error('❌ Error initializing health check routes:', error.message);
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
app.use((err, req, res, next) => {
  // Log error details
  console.error('Server error:', err);
  // Prepare error response
  const errorResponse = { 
    error: 'Server error',
    message: err.message || 'Unknown error occurred'
  };
  // Add stack trace in development
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }
  // Set appropriate status code
  const statusCode = err.statusCode || 500;
  // Send response
  res.status(statusCode).json(errorResponse);
});

// Error handling middleware (must be last)
app.use(errorTracking);

// Optimized server info logging
const logServerInfo = (port, dbConnected) => {
  const dbType = process.env.DATABASE_URL ? 
    (process.env.DATABASE_URL.startsWith('sqlite:') ? 'SQLite' : 'PostgreSQL') : 
    'SQLite';

  console.log('\n🚀 Viral Content Creator Server Started Successfully');
  console.log(`📍 URL: http://0.0.0.0:${port}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Database: ${dbType} ${dbConnected ? '✅' : '❌'}`);
  console.log(`🤖 AI Services: ${global.openai ? 'OpenAI ✅' : 'OpenAI ❌'} | ${global.anthropic ? 'Anthropic ✅' : 'Anthropic ❌'}`);
  console.log(`💾 Cache: Enabled`);
  console.log(`📈 Monitoring: Active`);
  console.log('─'.repeat(50));
};

// Start server
const startServer = async () => {
  try {
    // Always use PORT from env or default to 5000 instead of 3000 (which is often in use)
    const port = process.env.PORT || 5000;
    
    // Initialize all services
    const servicesInitialized = await initializeServices();
    
    // Attempt to start server
    const startServerOnPort = (portToUse) => {
      return new Promise((resolve, reject) => {
        const server = app.listen(portToUse, '0.0.0.0', () => {
          logServerInfo(portToUse, servicesInitialized);
          resolve(server);
        }).on('error', (err) => {
          if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ Port ${portToUse} is already in use, trying alternative port...`);
            server.close();
            // If the specified port is in use, try port 5000, or increment by 1 if already trying alternative
            const alternativePort = portToUse === port ? 5000 : portToUse + 1;
            resolve(startServerOnPort(alternativePort));
          } else {
            reject(err);
          }
        });
      });
    };

    const server = await startServerOnPort(port);

    // Graceful shutdown handling
    const gracefulShutdown = async (signal) => {
      console.log(`\n🔄 Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        console.log('🔌 HTTP server closed');
        
        if (global.integrationManager) {
          await global.integrationManager.shutdown();
        }
        
        console.log('✅ Graceful shutdown complete');
        process.exit(0);
      });
      
      // Force shutdown after 30 seconds
      setTimeout(() => {
        console.log('⚠️ Forcing shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('Fatal error starting server:', error);
    console.error(error.stack);
    process.exit(1);
  }
};

// Start the server with debug logging
console.log('🚀 Starting ViralCraft-AI server...');
console.log('📍 Node.js version:', process.version);
console.log('📍 Working directory:', process.cwd());
console.log('📍 Environment:', process.env.NODE_ENV || 'development');

startServer();

module.exports = app; // Export for testing