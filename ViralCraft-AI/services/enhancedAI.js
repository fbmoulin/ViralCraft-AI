
const { OpenAI } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const logger = require('../utils/logger');
const cacheService = require('./cacheService');

class EnhancedAIService {
  constructor() {
    this.openai = null;
    this.anthropic = null;
    this.initialized = false;
    this.fallbackMode = false;
    this.rateLimits = {
      openai: { requests: 0, lastReset: Date.now(), limit: 3500 },
      anthropic: { requests: 0, lastReset: Date.now(), limit: 50 }
    };
    this.modelPriority = ['claude-3-sonnet-20240229', 'gpt-4', 'gpt-3.5-turbo'];
    this.healthStatus = {
      openai: { available: false, lastCheck: null, errors: 0 },
      anthropic: { available: false, lastCheck: null, errors: 0 }
    };
  }

  async initialize() {
    logger.info('🤖 Initializing Enhanced AI Service...');

    try {
      // Initialize OpenAI
      if (process.env.OPENAI_API_KEY) {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 30000,
          maxRetries: 2
        });
        
        // Test OpenAI connection
        try {
          await this.testOpenAI();
          this.healthStatus.openai.available = true;
          this.healthStatus.openai.lastCheck = new Date();
          logger.info('✅ OpenAI initialized successfully');
        } catch (error) {
          logger.warn('⚠️ OpenAI test failed:', error.message);
          this.healthStatus.openai.errors++;
        }
      } else {
        logger.warn('⚠️ OpenAI API key not found');
      }

      // Initialize Anthropic
      if (process.env.ANTHROPIC_API_KEY) {
        this.anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY,
          timeout: 30000
        });

        // Test Anthropic connection
        try {
          await this.testAnthropic();
          this.healthStatus.anthropic.available = true;
          this.healthStatus.anthropic.lastCheck = new Date();
          logger.info('✅ Anthropic initialized successfully');
        } catch (error) {
          logger.warn('⚠️ Anthropic test failed:', error.message);
          this.healthStatus.anthropic.errors++;
        }
      } else {
        logger.warn('⚠️ Anthropic API key not found');
      }

      // Set fallback mode if no services are available
      this.fallbackMode = !this.healthStatus.openai.available && !this.healthStatus.anthropic.available;
      
      if (this.fallbackMode) {
        logger.warn('⚠️ No AI services available, running in fallback mode');
      }

      this.initialized = true;
      global.openai = this.openai;
      global.anthropic = this.anthropic;

      // Start periodic health checks
      this.startHealthMonitoring();

      return true;
    } catch (error) {
      logger.error('❌ AI service initialization failed:', error);
      this.fallbackMode = true;
      this.initialized = true; // Still mark as initialized for fallback functionality
      return false;
    }
  }

  async testOpenAI() {
    if (!this.openai) throw new Error('OpenAI not initialized');
    
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Test connection. Respond with OK.' }],
      max_tokens: 10
    });
    
    if (!response.choices?.[0]?.message?.content) {
      throw new Error('Invalid OpenAI response');
    }
  }

  async testAnthropic() {
    if (!this.anthropic) throw new Error('Anthropic not initialized');
    
    const response = await this.anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 10,
      messages: [{ role: 'user', content: 'Test connection. Respond with OK.' }]
    });
    
    if (!response.content?.[0]?.text) {
      throw new Error('Invalid Anthropic response');
    }
  }

  // Enhanced content generation with intelligent fallback
  async generateContent(params) {
    const {
      topic,
      contentType,
      platform,
      keywords = [],
      tone = 'professional',
      extractedData,
      additionalContext,
      suggestedTitle,
      suggestedContent
    } = params;

    // Generate cache key
    const cacheKey = `content_${JSON.stringify({
      topic, contentType, platform, keywords, tone
    })}`;

    // Try to get from cache first
    try {
      if (global.cacheService) {
        const cachedResult = await global.cacheService.get(cacheKey);
        if (cachedResult) {
          logger.info('📦 Returning cached content');
          return cachedResult;
        }
      }
    } catch (cacheError) {
      logger.warn('Cache lookup failed:', cacheError.message);
    }

    // Build enhanced prompt
    const prompt = this.buildEnhancedPrompt({
      topic, contentType, platform, keywords, tone,
      extractedData, additionalContext, suggestedTitle, suggestedContent
    });

    let result;
    const errors = [];

    // Try each available AI service in priority order
    for (const provider of this.getAvailableProviders()) {
      try {
        result = await this.generateWithProvider(provider, prompt, contentType, platform);
        
        // Cache successful result
        if (global.cacheService && result) {
          try {
            await global.cacheService.set(cacheKey, result, 3600); // Cache for 1 hour
          } catch (cacheError) {
            logger.warn('Cache save failed:', cacheError.message);
          }
        }

        // Reset error count on success
        this.healthStatus[provider].errors = 0;
        
        return result;
      } catch (error) {
        errors.push({ provider, error: error.message });
        this.healthStatus[provider].errors++;
        logger.warn(`${provider} generation failed:`, error.message);
        
        // Mark as unavailable if too many errors
        if (this.healthStatus[provider].errors >= 3) {
          this.healthStatus[provider].available = false;
          logger.warn(`Marking ${provider} as unavailable due to repeated errors`);
        }
      }
    }

    // All providers failed - use fallback
    logger.warn('All AI providers failed, using fallback generation');
    result = this.generateFallbackContent(params);
    
    // Log all errors for debugging
    logger.error('AI generation errors:', errors);
    
    return result;
  }

  buildEnhancedPrompt(params) {
    const {
      topic, contentType, platform, keywords, tone,
      extractedData, additionalContext, suggestedTitle, suggestedContent
    } = params;

    let systemPrompt = `You are an expert content creator specializing in viral ${platform} content.
Create ${contentType} content that is ${tone} and optimized for ${platform}.
Follow the Soulclap methodology focusing on transformation, practical value, and emotional connection.`;

    let userPrompt = `Create compelling ${contentType} content about: ${topic}

Requirements:
- Platform: ${platform}
- Tone: ${tone}
- Keywords to include: ${keywords.join(', ')}`;

    if (extractedData) {
      userPrompt += `\n\nBase your content on this extracted data:\n${extractedData}`;
    }

    if (additionalContext) {
      userPrompt += `\n\nAdditional context:\n${additionalContext}`;
    }

    if (suggestedTitle) {
      userPrompt += `\n\nSuggested title: ${suggestedTitle}`;
    }

    if (suggestedContent) {
      userPrompt += `\n\nContent outline:\n${suggestedContent}`;
    }

    userPrompt += `\n\nProvide:
1. An engaging title/headline
2. Complete ${contentType} content optimized for ${platform}
3. Relevant hashtags (if applicable)
4. Call-to-action`;

    return { systemPrompt, userPrompt };
  }

  async generateWithProvider(provider, prompt, contentType, platform) {
    const { systemPrompt, userPrompt } = prompt;

    if (provider === 'anthropic' && this.anthropic) {
      return await this.generateWithAnthropic(systemPrompt, userPrompt, contentType);
    } else if (provider === 'openai' && this.openai) {
      return await this.generateWithOpenAI(systemPrompt, userPrompt, contentType);
    }
    
    throw new Error(`Provider ${provider} not available`);
  }

  async generateWithAnthropic(systemPrompt, userPrompt, contentType) {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      max_tokens: this.getMaxTokensForContent(contentType),
      temperature: 0.7
    });

    return {
      content: response.content[0].text,
      model: 'claude-3-sonnet-20240229',
      provider: 'anthropic'
    };
  }

  async generateWithOpenAI(systemPrompt, userPrompt, contentType) {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: this.getMaxTokensForContent(contentType),
      temperature: 0.7
    });

    return {
      content: response.choices[0].message.content,
      model: 'gpt-4',
      provider: 'openai'
    };
  }

  generateFallbackContent(params) {
    const { topic, contentType, platform, tone = 'professional' } = params;
    
    const templates = {
      post: `🔥 ${topic} - O que você precisa saber!

Descubra os segredos que podem transformar sua perspectiva sobre ${topic}.

✨ 3 pontos principais:
• Estratégia comprovada para melhores resultados
• Dicas práticas que você pode aplicar hoje
• Insights que fazem a diferença

💡 Aplique essas estratégias e veja a transformação acontecer!

#${topic.replace(/\s+/g, '')} #transformacao #crescimento #${platform}`,

      story: `✨ A verdade sobre ${topic} que mudou tudo...

Quando descobri isto sobre ${topic}, minha perspectiva mudou completamente.

🎯 O que aprendi:
- Não é sobre perfeição, é sobre progresso
- Pequenas ações levam a grandes resultados
- A consistência é mais importante que a intensidade

💪 Sua jornada com ${topic} pode começar hoje!

#${topic.replace(/\s+/g, '')} #jornada #${platform}`,

      reel: `🚀 ${topic} em 30 segundos!

📌 Passo a passo:
1️⃣ Comece com o básico
2️⃣ Pratique consistentemente
3️⃣ Ajuste conforme necessário
4️⃣ Celebre os progressos

💡 Qual será seu primeiro passo?

#${topic.replace(/\s+/g, '')} #dicas #${platform}`,

      video: `🎬 Guia Completo: ${topic}

Neste vídeo, você vai descobrir:
• Os fundamentos essenciais de ${topic}
• Estratégias práticas e testadas
• Como evitar os erros mais comuns
• Próximos passos para o sucesso

🔔 Se este conteúdo agregou valor, curta e compartilhe!

#${topic.replace(/\s+/g, '')} #tutorial #${platform}`
    };

    return {
      content: templates[contentType] || templates.post,
      model: 'fallback',
      provider: 'fallback',
      note: 'Generated using fallback mode due to AI service unavailability'
    };
  }

  getMaxTokensForContent(contentType) {
    const tokenLimits = {
      post: 500,
      story: 300,
      reel: 200,
      video: 800,
      article: 1500,
      thread: 1000
    };
    return tokenLimits[contentType] || 500;
  }

  getAvailableProviders() {
    const available = [];
    
    if (this.healthStatus.anthropic.available && this.anthropic) {
      available.push('anthropic');
    }
    
    if (this.healthStatus.openai.available && this.openai) {
      available.push('openai');
    }
    
    return available;
  }

  startHealthMonitoring() {
    setInterval(async () => {
      // Test each provider periodically
      if (this.openai) {
        try {
          await this.testOpenAI();
          this.healthStatus.openai.available = true;
          this.healthStatus.openai.lastCheck = new Date();
        } catch (error) {
          this.healthStatus.openai.available = false;
          logger.warn('OpenAI health check failed:', error.message);
        }
      }

      if (this.anthropic) {
        try {
          await this.testAnthropic();
          this.healthStatus.anthropic.available = true;
          this.healthStatus.anthropic.lastCheck = new Date();
        } catch (error) {
          this.healthStatus.anthropic.available = false;
          logger.warn('Anthropic health check failed:', error.message);
        }
      }
    }, 300000); // Check every 5 minutes
  }

  getStatus() {
    return {
      initialized: this.initialized,
      fallbackMode: this.fallbackMode,
      openai: this.healthStatus.openai.available,
      anthropic: this.healthStatus.anthropic.available,
      availableProviders: this.getAvailableProviders(),
      healthStatus: this.healthStatus
    };
  }

  async generateWithFallback(params) {
    return this.generateFallbackContent(params);
  }

  async close() {
    logger.info('🤖 Shutting down Enhanced AI Service');
    this.initialized = false;
    // No explicit cleanup needed for OpenAI/Anthropic clients
  }
}

module.exports = new EnhancedAIService();
