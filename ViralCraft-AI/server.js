require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
// PostgreSQL imports
const { Sequelize, DataTypes } = require('sequelize');
const fs = require('fs');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static('public'));

// Initialize AI services with better error handling
const initializeAIServices = () => {
  console.log('🤖 Initializing AI services...');

  // Initialize OpenAI
  try {
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      const { OpenAI } = require('openai');
      global.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      console.log('✅ OpenAI service initialized');
    } else {
      console.warn('⚠️ OpenAI API key not set (set OPENAI_API_KEY in environment)');
      global.openai = null;
    }
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI:', error.message);
    global.openai = null;
  }

  // Initialize Anthropic
  try {
    if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
      const { Anthropic } = require('@anthropic-ai/sdk');
      global.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
      console.log('✅ Anthropic service initialized');
    } else {
      console.warn('⚠️ Anthropic API key not set (set ANTHROPIC_API_KEY in environment)');
      global.anthropic = null;
    }
  } catch (error) {
    console.error('❌ Failed to initialize Anthropic:', error.message);
    global.anthropic = null;
  }

  // Enable demo mode if no AI services are available
  if (!global.openai && !global.anthropic) {
    console.log('🎭 No AI services configured, running in demo mode');
    console.log('💡 Tip: Set OPENAI_API_KEY or ANTHROPIC_API_KEY for full functionality');
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

// Connect to Database using the database service
const connectDB = async () => {
  try {
    console.log('📊 Initializing database connection...');

    // Use the database service
    const databaseService = require('./services/database');
    const connected = await databaseService.initialize();

    if (connected) {
      console.log('✅ Database connected successfully');

      // Set global reference for routes
      global.db = databaseService;

      return true;
    } else {
      console.warn('⚠️ Database connection failed, running in memory mode');
      return false;
    }
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.warn('⚠️ Running without database');
    return false;
  }
};


// API Routes
app.get('/api/health', async (req, res) => {
  // Get database status
  let dbStatus = { connected: false, type: 'none' };
  if (global.db) {
    const healthCheck = await global.db.healthCheck();
    dbStatus = {
      connected: healthCheck.status === 'connected',
      type: healthCheck.type || 'unknown',
      contentCount: healthCheck.contentCount
    };
  }

  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + ' seconds',
    memory: process.memoryUsage().rss / 1024 / 1024 + ' MB',
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
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.1'
  });
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

    // Check if AI services are configured
    if (!global.openai && !global.anthropic) {
      return res.status(500).json({ 
        error: 'AI services not configured. Configure OPENAI_API_KEY and/or ANTHROPIC_API_KEY in .env' 
      });
    }

    // Build prompt based on Soulclap template
    const systemPrompt = `You are an expert in creating viral content following the Soulclap template.

    MAIN GUIDELINES:
    - Use irresistible hooks and magnetic headlines
    - Apply the 80/20 principle (20% of insights generate 80% of value)
    - Create emotional and connective content
    - Use storytelling and practical examples
    - Include strategic CTAs
    - Optimize for SEO and engagement

    SOULCLAP STRUCTURE:
    1. Headline & Hook (curiosity, surprise or questioning)
    2. Simplified Summary (2-3 lines with emojis)
    3. Accessible Glossary 
    4. Main text with didactic blocks
    5. Practical examples and tools
    6. Interactive quiz or poll
    7. Varied and engaging CTA

    Tone: ${tone || 'inspiring, accessible and transformative'}
    Platform: ${platform}
    Type: ${contentType}`;

    const userPrompt = `
    Topic: ${suggestedTitle || topic}
    Keywords: ${keywords?.join(', ') || ''}
    ${extractedData ? `\nExtracted data to use as basis:\n${extractedData}` : ''}
    ${additionalContext ? `\nAdditional context:\n${additionalContext}` : ''}
    ${suggestedContent ? `\nApproved content direction:\n${suggestedContent}` : ''}

    Create complete content STRICTLY following the Soulclap template, 
    including all elements for maximum engagement and viral potential.
    ${suggestedTitle ? `Use the approved title: "${suggestedTitle}"` : ''}
    ${suggestedContent ? 'Expand on the approved content direction while maintaining its essence.' : ''}`;

    let generatedContent = '';
    let adaptedContent = {};

    // Generate content using available APIs
    if (global.anthropic) {
      // Use Claude for main content generation
      const response = await global.anthropic.messages.create({
        model: "claude-3-sonnet-20240229",
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: 4000
      });

      generatedContent = response.content[0].text;
    } else if (global.openai) {
      // Fallback to OpenAI if Anthropic is not available
      const response = await global.openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 3000
      });

      generatedContent = response.choices[0].message.content;
    } else {
      // Simulated content if no API is configured
      generatedContent = `# Example Viral Content Generated for ${platform}

**Headline:** ${topic}

**Summary:** This is a sample content generated by Soulclap Content Creator ✨

Configure your API keys to get real AI-generated content!`;
    }

    // Adapt content for multiple platforms if requested
    adaptedContent[platform] = generatedContent;

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

    // Check if AI services are configured
    if (!global.openai && !global.anthropic) {
      return res.status(500).json({ 
        error: 'AI services not configured. Configure OPENAI_API_KEY and/or ANTHROPIC_API_KEY in .env' 
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
        model: "claude-3-haiku-20240307",
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        max_tokens: 1000
      });

      suggestion.content = response.content[0].text;
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

// Add YouTube routes
try {
  const youtubeRoutes = require('./routes/youtube-routes');
  app.use('/api/youtube', youtubeRoutes);
  console.log('✅ YouTube routes initialized');
} catch (error) {
  console.error('❌ Error initializing YouTube routes:', error.message);
}

// Default route - serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Catch-all route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = `${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`;
    if (res.statusCode >= 400) {
      console.error(`❌ ${log}`);
    } else {
      console.log(`✅ ${log}`);
    }
  });
  next();
});

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

// Utility function to log server info
const logServerInfo = (port, dbConnected) => {
  const dbType = process.env.DATABASE_URL ? 
    (process.env.DATABASE_URL.startsWith('sqlite:') ? 'SQLite' : 'PostgreSQL') : 
    'None';
  console.log(`🚀 Soulclap server running at http://0.0.0.0:${port}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📊 Database (${dbType}): ${dbConnected ? 'Connected' : 'Not connected'}`);
  console.log(`🧠 AI Services: ${global.openai ? 'OpenAI ✓' : 'OpenAI ✗'} | ${global.anthropic ? 'Anthropic ✓' : 'Anthropic ✗'}`);
};

// Start server
const startServer = async () => {
  try {
    // Always use PORT from env or default to 5000 instead of 3000 (which is often in use)
    const port = process.env.PORT || 5000;
    // Connect to database
    const dbConnected = await connectDB();
    // Attempt to start server
    const startServerOnPort = (portToUse) => {
      return new Promise((resolve, reject) => {
        const server = app.listen(portToUse, '0.0.0.0', () => {
          logServerInfo(portToUse, dbConnected);
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
    await startServerOnPort(port);
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