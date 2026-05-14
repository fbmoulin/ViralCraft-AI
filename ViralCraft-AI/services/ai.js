/**
 * AI Service - Optimized with enhanced performance, caching, and error handling
 */

const { OpenAI } = require('openai');
const logger = require('../utils/logger');
const performanceService = require('./performanceService');

class AIService {
  constructor() {
    this.openai = null;
    this.initialized = false;
    this.fallbackMode = false;
    this.requestCache = new Map();
    this.rateLimits = {
      openai: { requests: 0, resetTime: 0 }
    };
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cacheHits: 0
    };
  }

  async initialize() {
    console.log('🤖 Initializing optimized AI service...');

    try {
      if (this.isValidApiKey(process.env.OPENAI_API_KEY)) {
        console.log('🔧 Creating optimized OpenAI client...');
        this.openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 30000,
          maxRetries: 3,
          defaultHeaders: {
            'User-Agent': 'ViralCraft-AI/1.0'
          }
        });

        const testResult = await this.testConnection();
        if (testResult) {
          console.log('✅ OpenAI service optimized and ready');
          this.fallbackMode = false;
          global.openai = this.openai;
        } else {
          this.enableFallbackMode();
        }
      } else {
        this.enableFallbackMode();
      }

      this.initialized = true;
      this.startMetricsCollection();
      return !this.fallbackMode;
    } catch (error) {
      console.error('❌ AI service initialization failed:', error.message);
      this.enableFallbackMode();
      return false;
    }
  }

  isValidApiKey(key) {
    return key && key !== 'your_openai_api_key_here' && key.length > 20 && key.startsWith('sk-');
  }

  enableFallbackMode() {
    console.warn('⚠️ Enabling optimized fallback mode');
    this.fallbackMode = true;
    global.openai = null;
  }

  async testConnection() {
    if (!this.openai) return false;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'Test connection' }],
        max_tokens: 5
      });

      console.log('✅ OpenAI connection verified');
      return true;
    } catch (error) {
      console.error('❌ Connection test failed:', error.message);
      return false;
    }
  }

  async generateContent(params) {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(params);
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.metrics.cacheHits++;
        console.log('⚡ Serving content from cache');
        return cached;
      }

      let result;
      if (this.fallbackMode || !this.openai) {
        result = this.generateFallbackContent(params);
      } else if (this.isServiceAvailable('openai')) {
        try {
          result = await this.generateWithOpenAI(params);
          this.cacheResult(cacheKey, result);
        } catch (error) {
          logger.error('OpenAI generation failed, using fallback', error);
          result = this.generateFallbackContent(params);
        }
      } else {
        result = this.generateFallbackContent(params);
      }

      this.metrics.successfulRequests++;
      performanceService.recordAIRequest(Date.now() - startTime, result.tokensUsed || 0, true);
      return result;
    } catch (error) {
      this.metrics.failedRequests++;
      performanceService.recordAIRequest(Date.now() - startTime, 0, false);
      logger.error('Content generation failed', error);
      return this.generateFallbackContent(params);
    }
  }

  generateCacheKey(params) {
    const { topic, contentType, platform, tone, keywords } = params;
    const keyString = `${topic}-${contentType}-${platform}-${tone}-${(keywords || []).join(',')}`;
    return Buffer.from(keyString).toString('base64').slice(0, 32);
  }

  getFromCache(key) {
    const cached = this.requestCache.get(key);
    if (cached && Date.now() - cached.timestamp < 300000) {
      // 5 minutes TTL
      return cached.data;
    }
    if (cached) {
      this.requestCache.delete(key);
    }
    return null;
  }

  cacheResult(key, result) {
    // Implement LRU cache with size limit
    if (this.requestCache.size >= 50) {
      const firstKey = this.requestCache.keys().next().value;
      this.requestCache.delete(firstKey);
    }

    this.requestCache.set(key, {
      data: result,
      timestamp: Date.now()
    });
  }

  async generateWithOpenAI(params) {
    const { topic, contentType, platform, tone, extractedData } = params;

    const systemPrompt = this.buildOptimizedSystemPrompt(contentType, platform, tone);
    const userPrompt = this.buildOptimizedUserPrompt(topic, extractedData, params);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: 3000,
      temperature: 0.7,
      presence_penalty: 0.1,
      frequency_penalty: 0.1
    });

    return {
      content: response.choices[0].message.content,
      provider: 'openai',
      model: 'gpt-4',
      tokensUsed: response.usage?.total_tokens || 0,
      cached: false
    };
  }

  generateFallbackContent(params) {
    const { topic, contentType, platform } = params;

    const enhancedTemplates = {
      instagram: {
        post: this.generateInstagramPost(topic),
        story: this.generateInstagramStory(topic),
        reel: this.generateInstagramReel(topic)
      },
      tiktok: {
        video: this.generateTikTokVideo(topic),
        trend: this.generateTikTokTrend(topic)
      },
      youtube: {
        video: this.generateYouTubeVideo(topic),
        short: this.generateYouTubeShort(topic)
      }
    };

    const content =
      enhancedTemplates[platform]?.[contentType] || this.generateGenericContent(topic);

    return {
      content,
      provider: 'fallback',
      model: 'optimized-template',
      tokensUsed: 0,
      cached: false
    };
  }

  generateInstagramPost(topic) {
    const hooks = [
      `🚀 ${topic} mudou minha vida em 30 dias`,
      `💡 O segredo de ${topic} que ninguém conta`,
      `⚡ Como dominar ${topic} em tempo recorde`
    ];

    const hook = hooks[Math.floor(Math.random() * hooks.length)];

    return `${hook}

✨ Se você quer transformar sua relação com ${topic}, este post é para você!

💪 3 estratégias comprovadas:
• Foque no essencial (princípio 80/20)
• Pratique consistentemente 
• Meça seus resultados

📈 Resultados em 30 dias:
• Mais clareza e foco
• Melhores resultados
• Menos stress e ansiedade

💬 Conta nos comentários: qual sua maior dificuldade com ${topic}?

#${topic.replace(/\s+/g, '')} #TransformacaoPessoal #Resultado #Foco`;
  }

  generateInstagramStory(topic) {
    return `🔥 ${topic} em 60 segundos!

→ Deslize para descobrir o método
→ Salve para não esquecer  
→ Compartilhe com um amigo

#${topic.replace(/\s+/g, '')} #DicaRapida`;
  }

  generateInstagramReel(topic) {
    return `POV: Você descobriu o segredo de ${topic} 🤯

*música trending*

Antes: Lutando com ${topic} 😤
Depois: Dominando ${topic} 💪

O que mudou? Swipe para descobrir! →

#${topic.replace(/\s+/g, '')} #Transformacao #ViralContent #Fyp`;
  }

  generateTikTokVideo(topic) {
    return `Testei ${topic} por 30 dias e ISSO aconteceu... 😱

Dia 1: Completamente perdido
Dia 15: Começando a entender  
Dia 30: RESULTADO INCRÍVEL!

Quer saber o método exato? 
Comenta "MÉTODO" que eu mando no direct! 📩

#${topic.replace(/\s+/g, '')} #30DiasDesafio #TransformacaoReal #Fyp`;
  }

  generateTikTokTrend(topic) {
    return `Tell me you're learning ${topic} without telling me you're learning ${topic}...

*mostra resultados impressionantes*

Parte 2? 👀

#${topic.replace(/\s+/g, '')} #TellMeWithoutTellingMe #Trending #Viral`;
  }

  generateYouTubeVideo(topic) {
    return `${topic}: O Método Que Está REVOLUCIONANDO Tudo! (Resultados em 30 Dias)

🎯 NESTE VÍDEO VOCÊ VAI DESCOBRIR:
• O sistema exato que usei para dominar ${topic}
• Os 3 erros que 90% das pessoas cometem
• Como aplicar isso na sua vida hoje mesmo
• Resultados reais de quem aplicou o método

⏰ TIMESTAMPS:
00:00 - Introdução 
02:30 - O Problema Principal
05:15 - A Solução Revolucionária  
08:40 - Como Aplicar (Passo a Passo)
12:20 - Resultados Reais
15:00 - Conclusão e Próximos Passos

💰 RECURSOS MENCIONADOS:
• Link da planilha gratuita (descrição)
• Curso completo (link na descrição)  
• Comunidade exclusiva (primeiro comentário)

👆 SE ESTE VÍDEO TE AJUDOU:
• Deixe seu LIKE 👍
• INSCREVA-SE no canal 🔔
• COMPARTILHE com quem precisa 📤

💬 COMENTA AQUI: Qual sua maior dificuldade com ${topic}?

#${topic.replace(/\s+/g, '')} #Tutorial #TransformacaoReal #ResultadosReais`;
  }

  generateYouTubeShort(topic) {
    return `${topic} em 60 SEGUNDOS! ⚡

A técnica que mudou TUDO:

✅ Passo 1: [Fundamento]
✅ Passo 2: [Ação]  
✅ Passo 3: [Resultado]

Resultado? TRANSFORMAÇÃO TOTAL! 🔥

Quer o guia completo? Link na bio! 👆

#${topic.replace(/\s+/g, '')} #Shorts #DicaRapida #Transformacao`;
  }

  generateGenericContent(topic) {
    return `# Conteúdo Revolucionário: ${topic}

🚀 **Descoberta que Vai Mudar Sua Perspectiva**

Você está pronto para uma transformação real em ${topic}? 

## ✨ O Que Você Vai Aprender:
• Estratégias comprovadas e eficazes
• Métodos que realmente funcionam  
• Como aplicar na prática hoje mesmo

## 💪 Resultados Esperados:
• Maior clareza e foco
• Melhores resultados em menos tempo
• Confiança para alcançar seus objetivos

## 🎯 Próximos Passos:
1. Aplique as estratégias compartilhadas
2. Acompanhe seus resultados
3. Ajuste conforme necessário

💡 **Configure suas chaves de API para conteúdo personalizado com IA!**

---
*Conteúdo otimizado para máximo engajamento e resultados reais.*`;
  }

  buildOptimizedSystemPrompt(contentType, platform, tone) {
    return `Você é um especialista em criação de conteúdo viral otimizado para ${platform}.

DIRETRIZES DE PERFORMANCE:
- Hooks irresistíveis nos primeiros 3 segundos
- Storytelling emocional e conectivo
- Call-to-actions estratégicos para máximo engajamento
- Otimização para algoritmos de ${platform}
- Linguagem ${tone || 'inspiradora e acessível'}

ESTRUTURA OTIMIZADA:
1. Hook magnético (curiosidade/surpresa)
2. Desenvolvimento envolvente com valor prático
3. Exemplos concretos e aplicáveis
4. CTA específico para ${platform}

Tipo: ${contentType} | Plataforma: ${platform}`;
  }

  buildOptimizedUserPrompt(topic, extractedData, params) {
    const { keywords, additionalContext } = params;

    return `Tópico: ${topic}
${keywords?.length ? `Palavras-chave: ${keywords.join(', ')}` : ''}
${extractedData ? `\nBase de dados: ${extractedData}` : ''}
${additionalContext ? `\nContexto: ${additionalContext}` : ''}

Crie conteúdo otimizado para máximo engajamento e potencial viral.`;
  }

  isServiceAvailable(service) {
    const now = Date.now();
    return now > this.rateLimits[service].resetTime;
  }

  startMetricsCollection() {
    // Clean cache every 10 minutes
    setInterval(() => {
      this.cleanCache();
    }, 600000);

    // Log metrics every 5 minutes
    setInterval(() => {
      this.logMetrics();
    }, 300000);
  }

  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.requestCache.entries()) {
      if (now - value.timestamp > 300000) {
        this.requestCache.delete(key);
      }
    }
  }

  logMetrics() {
    const hitRate =
      this.metrics.totalRequests > 0
        ? ((this.metrics.cacheHits / this.metrics.totalRequests) * 100).toFixed(1)
        : 0;

    console.log(
      `📊 AI Service Metrics: ${this.metrics.successfulRequests}/${this.metrics.totalRequests} successful, ${hitRate}% cache hit rate`
    );
  }

  getStatus() {
    return {
      initialized: this.initialized,
      openai: !!this.openai,
      fallbackMode: this.fallbackMode,
      metrics: this.metrics,
      cacheSize: this.requestCache.size
    };
  }

  async generateImage(prompt, options = {}) {
    if (!this.openai) {
      return { error: 'OpenAI not configured for image generation' };
    }

    try {
      const optimizedPrompt = `${prompt}, ${options.style || 'digital art, professional, high quality'}, trending, viral aesthetic`;

      const response = await this.openai.images.generate({
        model: 'dall-e-3',
        prompt: optimizedPrompt,
        n: 1,
        size: options.size || '1024x1024',
        quality: 'hd',
        style: options.artistic_style || 'vivid'
      });

      return {
        imageUrl: response.data[0].url,
        provider: 'openai',
        prompt: optimizedPrompt
      };
    } catch (error) {
      logger.error('Image generation failed', error);
      return { error: error.message };
    }
  }
}

module.exports = new AIService();
