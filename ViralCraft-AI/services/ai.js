/**
 * AI Service - Robust integration with multiple AI providers
 * Implements fallbacks, retry logic, and error handling
 */

const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const performanceService = require('./performanceService');

class AIService {
  constructor() {
    this.openai = null;
    this.initialized = false;
    this.fallbackMode = false;
    this.requestQueue = [];
    this.rateLimits = {
      openai: { requests: 0, resetTime: 0 }
    };
  }

  async initialize() {
    console.log('🤖 Initializing OpenAI service...');
    console.log('🔍 DEBUG: Environment check');
    console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
    console.log('🔍 OpenAI key present:', !!process.env.OPENAI_API_KEY);

    try {
      // Initialize OpenAI only
      if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 30000, // 30 second timeout
          maxRetries: 3
        });

        // Test OpenAI connection
        await this.testOpenAI();
        console.log('✅ OpenAI service initialized and tested');
      } else {
        console.warn('⚠️ OpenAI API key not configured');
        this.fallbackMode = true;
      }

      // Check if OpenAI service is available
      if (!this.openai) {
        console.log('🎭 OpenAI not configured, enabling fallback mode');
        this.fallbackMode = true;
      }

      // Make services globally available for backwards compatibility
      global.openai = this.openai;
      global.anthropic = null; // Disable Anthropic
      global.aiService = this;

      // OpenAI Configuration
      if (process.env.OPENAI_API_KEY) {
        console.log('✅ OpenAI API key configured');
        console.log('🔍 OpenAI key length:', process.env.OPENAI_API_KEY.length);
      } else {
        console.log('⚠️ OpenAI API key not configured');
        console.log('💡 Tip: Add OPENAI_API_KEY to your environment variables');
        console.log('🎭 Running in fallback mode');
        console.log('📋 Available fallback features: mock responses, cached results');
      }

      this.initialized = true;
      return true;

    } catch (error) {
      logger.error('OpenAI service initialization failed', error);
      this.fallbackMode = true;
      this.initialized = true;
      return false;
    }
  }

  async testOpenAI() {
    if (!this.openai) return false;

    try {
      await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: "Test" }],
        max_tokens: 5
      });
      return true;
    } catch (error) {
      logger.warn('OpenAI test failed', error);
      return false;
    }
  }

  async generateContent(params) {
    const startTime = Date.now();

    try {
      if (this.fallbackMode) {
        return this.generateFallbackContent(params);
      }

      // Use OpenAI only
      if (this.openai && this.isServiceAvailable('openai')) {
        try {
          const result = await this.generateWithOpenAI(params);
          performanceService.recordAIRequest(Date.now() - startTime, result.tokensUsed, true);
          return result;
        } catch (error) {
          logger.error('OpenAI generation failed', error);
          this.updateRateLimit('openai', error);
        }
      }

      // OpenAI failed, use fallback
      logger.warn('OpenAI service failed, using fallback content');
      return this.generateFallbackContent(params);

    } catch (error) {
      performanceService.recordAIRequest(Date.now() - startTime, 0, false);
      logger.error('AI content generation failed completely', error);
      return this.generateFallbackContent(params);
    }
  }

  

  async generateWithOpenAI(params) {
    const { topic, contentType, platform, tone, extractedData } = params;

    const systemPrompt = this.buildSystemPrompt(contentType, platform, tone);
    const userPrompt = this.buildUserPrompt(topic, extractedData, params);

    const response = await this.openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 3000,
      temperature: 0.7
    });

    return {
      content: response.choices[0].message.content,
      provider: 'openai',
      model: 'gpt-4',
      tokensUsed: response.usage?.total_tokens || 0
    };
  }

  generateFallbackContent(params) {
    const { topic, contentType, platform } = params;

    const templates = {
      'instagram': {
        'post': `🚀 ${topic} - O Guia Definitivo\n\n✨ Descubra os segredos que estão transformando ${topic}\n\n💡 3 dicas essenciais:\n• Foque no que realmente importa\n• Aplique o princípio 80/20\n• Meça seus resultados\n\n#${topic.replace(/\s+/g, '')} #ViralContent #Transformacao`,
        'story': `${topic} 🔥\n\nO que você precisa saber HOJE!\n\n→ Swipe para descobrir`,
        'reel': `${topic} em 30 segundos! ⏰\n\nSalve este post para não esquecer! 📌`
      },
      'tiktok': {
        'video': `POV: Você descobriu o segredo de ${topic} 🤯\n\n#${topic.replace(/\s+/g, '')} #viral #dica #fyp`,
        'trend': `Testei ${topic} por 30 dias e isso aconteceu... 😱\n\nParte 1/3 👀`
      },
      'youtube': {
        'video': `${topic}: O Método Que Está Revolucionando Tudo!\n\n🎯 Neste vídeo você vai descobrir:\n• O segredo por trás de ${topic}\n• Como aplicar na prática\n• Resultados reais em 30 dias\n\n👆 Se inscreva e ative o sininho!`,
        'short': `${topic} em 60 segundos! ⚡\n\nVocê não vai acreditar no resultado...`
      }
    };

    const content = templates[platform]?.[contentType] || 
                   `# ${topic}\n\nConteúdo incrível sobre ${topic} está sendo gerado...\n\n✨ Configure suas chaves de API para conteúdo personalizado com IA!`;

    return {
      content,
      provider: 'fallback',
      model: 'template',
      tokensUsed: 0
    };
  }

  buildSystemPrompt(contentType, platform, tone) {
    return `Você é um especialista em criação de conteúdo viral seguindo o template Soulclap.

DIRETRIZES PRINCIPAIS:
- Use hooks irresistíveis e títulos magnéticos
- Aplique o princípio 80/20 (20% dos insights geram 80% do valor)
- Crie conteúdo emocional e conectivo
- Use storytelling e exemplos práticos
- Inclua CTAs estratégicos
- Otimize para SEO e engajamento

ESTRUTURA SOULCLAP:
1. Título & Hook (curiosidade, surpresa ou questionamento)
2. Resumo Simplificado (2-3 linhas com emojis)
3. Glossário Acessível
4. Texto principal com blocos didáticos
5. Exemplos práticos e ferramentas
6. Quiz ou enquete interativa
7. CTA variado e envolvente

Tom: ${tone || 'inspirador, acessível e transformador'}
Plataforma: ${platform}
Tipo: ${contentType}`;
  }

  buildUserPrompt(topic, extractedData, params) {
    const { keywords, additionalContext, suggestedTitle, suggestedContent } = params;

    return `
Tópico: ${suggestedTitle || topic}
Palavras-chave: ${keywords?.join(', ') || ''}
${extractedData ? `\nDados extraídos para usar como base:\n${extractedData}` : ''}
${additionalContext ? `\nContexto adicional:\n${additionalContext}` : ''}
${suggestedContent ? `\nDireção aprovada do conteúdo:\n${suggestedContent}` : ''}

Crie conteúdo completo seguindo RIGOROSAMENTE o template Soulclap,
incluindo todos os elementos para máximo engajamento e potencial viral.
${suggestedTitle ? `Use o título aprovado: "${suggestedTitle}"` : ''}
${suggestedContent ? 'Expanda a direção aprovada mantendo sua essência.' : ''}`;
  }

  isServiceAvailable(service) {
    const now = Date.now();
    const rateLimit = this.rateLimits[service];

    return now > rateLimit.resetTime;
  }

  updateRateLimit(service, error) {
    if (error.status === 429) {
      // Rate limited - wait 1 minute
      this.rateLimits[service].resetTime = Date.now() + 60000;
      logger.warn(`${service} rate limited, backing off for 1 minute`);
    } else if (error.status >= 500) {
      // Server error - wait 30 seconds
      this.rateLimits[service].resetTime = Date.now() + 30000;
      logger.warn(`${service} server error, backing off for 30 seconds`);
    }
  }

  async generateImage(prompt, options = {}) {
    if (!this.openai) {
      return { error: 'OpenAI not configured for image generation' };
    }

    try {
      const response = await this.openai.images.generate({
        model: "dall-e-3",
        prompt: `${prompt}, ${options.style || 'digital art'}, high quality, professional`,
        n: 1,
        size: options.size || "1024x1024",
        quality: "hd"
      });

      return {
        imageUrl: response.data[0].url,
        provider: 'openai'
      };
    } catch (error) {
      logger.error('Image generation failed', error);
      return { error: error.message };
    }
  }

  getStatus() {
    return {
      initialized: this.initialized,
      openai: !!this.openai,
      anthropic: false, // Disabled
      fallbackMode: this.fallbackMode,
      rateLimits: this.rateLimits.openai
    };
  }
}

module.exports = new AIService();