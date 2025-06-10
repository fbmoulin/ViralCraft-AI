// Implementação otimizada do serviço de IA com cache e melhor tratamento de erros
const config = require('../config/app');
const NodeCache = require('node-cache');

class AIService {
  constructor() {
    this.openai = null;
    this.anthropic = null;
    this.initialized = false;
    this.status = {
      openai: { available: false, error: null, model: null },
      anthropic: { available: false, error: null, model: null }
    };
    
    // Implementação de cache com TTL de 30 minutos
    this.cache = new NodeCache({ 
      stdTTL: 1800, // 30 minutos em segundos
      checkperiod: 300, // Verificar expiração a cada 5 minutos
      useClones: false // Melhor performance
    });
    
    // Contador de requisições para métricas
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      lastError: null,
      averageResponseTime: 0
    };
  }

  async initialize() {
    console.log('🤖 Inicializando serviços de IA...');
    let hasAnyService = false;

    // Verificar se estamos em modo de demonstração
    const demoMode = process.env.DEMO_MODE === 'true';
    if (demoMode) {
      console.log('🎭 Modo de demonstração ativado - usando respostas simuladas');
      this.status.demo = { available: true, error: null, model: 'demo' };
      return true;
    }

    // Inicializar OpenAI primeiro (priorizado)
    await this.initializeOpenAI();
    if (this.status.openai.available) {
      hasAnyService = true;
    }

    // Inicializar Anthropic como fallback
    await this.initializeAnthropic();
    if (this.status.anthropic.available) {
      hasAnyService = true;
    }

    this.initialized = true;
    
    if (!hasAnyService) {
      console.warn('⚠️ Nenhum serviço de IA disponível - configure as chaves de API nas variáveis de ambiente');
      console.warn('Configure OPENAI_API_KEY para OpenAI ou ANTHROPIC_API_KEY para Anthropic');
      console.warn('Alternativamente, ative o modo de demonstração com DEMO_MODE=true');
    }
    
    return hasAnyService || demoMode;
  }

  async initializeOpenAI() {
    const apiKey = process.env.OPENAI_API_KEY || config.ai?.openai?.apiKey;
    
    if (!apiKey || apiKey === 'your_openai_api_key_here' || apiKey.length < 10) {
      console.warn('⚠️ Chave de API OpenAI não configurada ou inválida');
      this.status.openai = { available: false, error: 'Chave de API não configurada', model: null };
      return;
    }

    try {
      const { OpenAI } = require('openai');
      
      this.openai = new OpenAI({
        apiKey: apiKey,
        timeout: config.ai?.timeout || 45000,
        maxRetries: 2
      });

      // Testar conexão com uma chamada de API simples com timeout
      const testPromise = this.openai.models.list();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout de conexão')), 10000)
      );
      
      const models = await Promise.race([testPromise, timeoutPromise]);
      
      if (models && models.data && models.data.length > 0) {
        this.status.openai = { 
          available: true, 
          error: null, 
          model: config.ai?.openai?.model || 'gpt-4'
        };
        console.log(`✅ Serviço OpenAI inicializado com sucesso (${this.status.openai.model})`);
      } else {
        throw new Error('Nenhum modelo disponível');
      }
      
    } catch (error) {
      this.openai = null;
      let errorMessage = error.message;
      
      // Fornecer mensagens de erro mais específicas
      if (error.message.includes('401')) {
        errorMessage = 'Chave de API inválida - verifique sua OPENAI_API_KEY';
      } else if (error.message.includes('429')) {
        errorMessage = 'Limite de taxa excedido - tente novamente mais tarde';
      } else if (error.message.includes('timeout')) {
        errorMessage = 'Timeout de conexão - verifique sua conexão com a internet';
      }
      
      this.status.openai = { 
        available: false, 
        error: errorMessage, 
        model: null 
      };
      console.error('❌ Inicialização do OpenAI falhou:', errorMessage);
    }
  }

  async initializeAnthropic() {
    const apiKey = process.env.ANTHROPIC_API_KEY || config.ai?.anthropic?.apiKey;
    
    if (!apiKey || apiKey === 'your_anthropic_api_key_here' || apiKey.length < 10) {
      console.warn('⚠️ Chave de API Anthropic não configurada ou inválida');
      this.status.anthropic = { available: false, error: 'Chave de API não configurada', model: null };
      return;
    }

    try {
      const { Anthropic } = require('@anthropic-ai/sdk');
      
      this.anthropic = new Anthropic({
        apiKey: apiKey,
        timeout: config.ai?.timeout || 30000
      });

      // Anthropic não precisa de uma chamada de teste, apenas verificar se a instância foi criada
      this.status.anthropic = { 
        available: true, 
        error: null, 
        model: config.ai?.anthropic?.model || 'claude-3-sonnet'
      };
      console.log(`✅ Serviço Anthropic inicializado com sucesso (${this.status.anthropic.model})`);
      
    } catch (error) {
      this.anthropic = null;
      this.status.anthropic = { 
        available: false, 
        error: error.message, 
        model: null 
      };
      console.error('❌ Inicialização do Anthropic falhou:', error.message);
    }
  }

  isAvailable() {
    return this.status.openai?.available || this.status.anthropic?.available || this.status.demo?.available;
  }

  getStatus() {
    return {
      initialized: this.initialized,
      services: this.status,
      availableModels: this.getAvailableModels(),
      preferredService: this.getPreferredService(),
      metrics: {
        totalRequests: this.metrics.totalRequests,
        cacheHits: this.metrics.cacheHits,
        cacheMisses: this.metrics.cacheMisses,
        cacheHitRate: this.metrics.totalRequests > 0 
          ? Math.round((this.metrics.cacheHits / this.metrics.totalRequests) * 100) 
          : 0,
        errors: this.metrics.errors,
        lastError: this.metrics.lastError,
        averageResponseTime: `${Math.round(this.metrics.averageResponseTime)}ms`
      }
    };
  }

  getPreferredService() {
    if (this.status.demo?.available) return 'demo';
    if (this.status.openai?.available) return 'openai';
    if (this.status.anthropic?.available) return 'anthropic';
    return null;
  }

  getAvailableModels() {
    const models = [];
    if (this.status.openai?.available) {
      models.push('gpt-4', 'gpt-3.5-turbo', 'dall-e-3');
    }
    if (this.status.anthropic?.available) {
      models.push('claude-3-sonnet', 'claude-3-haiku');
    }
    if (this.status.demo?.available) {
      models.push('demo-model');
    }
    return models;
  }

  async generateContent(params) {
    this.metrics.totalRequests++;
    const startTime = Date.now();
    
    try {
      if (!this.isAvailable()) {
        throw new Error('Nenhum serviço de IA disponível. Configure a chave de API do OpenAI (OPENAI_API_KEY) ou Anthropic (ANTHROPIC_API_KEY), ou ative o modo de demonstração (DEMO_MODE=true).');
      }

      const {
        topic,
        platform = 'universal',
        contentType = 'post',
        tone = 'inspirational',
        keywords = [],
        targetAudience,
        callToAction,
        includeHashtags = true
      } = params;

      // Gerar chave de cache baseada nos parâmetros
      const cacheKey = this.generateCacheKey('content', {
        topic, platform, contentType, tone, 
        keywords: keywords.sort().join(','),
        targetAudience, callToAction, includeHashtags
      });

      // Verificar cache
      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult) {
        this.metrics.cacheHits++;
        console.log('🔄 Conteúdo recuperado do cache');
        
        // Atualizar métricas
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        this.updateResponseTimeMetric(responseTime);
        
        return cachedResult;
      }
      
      this.metrics.cacheMisses++;
      console.log('🔍 Gerando novo conteúdo...');

      const systemPrompt = this.buildSystemPrompt(platform, contentType, tone);
      const userPrompt = this.buildUserPrompt({
        topic,
        keywords,
        targetAudience,
        callToAction,
        includeHashtags,
        platform,
        contentType
      });

      let result;
      let service;
      let attempts = 0;
      const maxAttempts = 2;

      // Modo de demonstração
      if (this.status.demo?.available) {
        result = this.generateDemoContent(params);
        service = 'demo';
      } else {
        while (attempts < maxAttempts && !result) {
          try {
            // Tentar OpenAI primeiro (preferido)
            if (this.status.openai?.available && this.openai) {
              console.log('🎯 Gerando conteúdo com OpenAI...');
              result = await this.generateWithOpenAI(systemPrompt, userPrompt);
              service = 'gpt-4';
            } 
            // Fallback para Anthropic se disponível
            else if (this.status.anthropic?.available && this.anthropic) {
              console.log('🎯 Gerando conteúdo com Anthropic...');
              result = await this.generateWithAnthropic(systemPrompt, userPrompt);
              service = 'claude-3-sonnet';
            } 
            else {
              throw new Error('Nenhum serviço de IA está funcionando corretamente');
            }
          } catch (error) {
            attempts++;
            console.error(`Tentativa ${attempts} falhou:`, error.message);
            
            if (attempts >= maxAttempts) {
              this.metrics.errors++;
              this.metrics.lastError = error.message;
              throw new Error(`Erro na geração de conteúdo após ${maxAttempts} tentativas: ${error.message}`);
            }
            
            // Esperar antes de tentar novamente
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!result) {
        this.metrics.errors++;
        this.metrics.lastError = 'Falha na geração de conteúdo';
        throw new Error('Falha na geração de conteúdo');
      }

      const viralScore = this.calculateViralScore(result, platform);

      const finalResult = {
        content: result,
        service,
        metadata: {
          viralScore,
          wordCount: result.split(' ').length,
          platform,
          contentType,
          tone,
          generatedAt: new Date().toISOString(),
          attempts
        }
      };

      // Salvar no cache
      this.cache.set(cacheKey, finalResult);
      
      // Atualizar métricas
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      this.updateResponseTimeMetric(responseTime);
      
      return finalResult;
    } catch (error) {
      // Atualizar métricas de erro
      this.metrics.errors++;
      this.metrics.lastError = error.message;
      
      // Registrar erro
      console.error('Erro na geração de conteúdo:', error);
      
      // Lançar erro para tratamento superior
      throw error;
    }
  }

  generateDemoContent(params) {
    const { topic, platform, contentType, tone } = params;
    
    // Conteúdo de demonstração baseado nos parâmetros
    return `# ${topic} - Conteúdo para ${platform}

## 💡 Resumo
Este é um conteúdo de demonstração gerado para mostrar como seria um post viral sobre "${topic}" na plataforma ${platform}, com tom ${tone} e formato ${contentType}. ✨

## Conteúdo Principal
Você já parou para pensar sobre ${topic}? Esta é uma questão que afeta muitas pessoas diariamente.

Aqui estão 3 pontos importantes:
1. O primeiro aspecto a considerar é a relevância no contexto atual
2. Em segundo lugar, precisamos analisar o impacto nas diferentes audiências
3. Por fim, as tendências futuras mostram um crescimento significativo nesta área

## Exemplos Práticos
- Caso de sucesso: Empresa X implementou esta abordagem e viu resultados 30% melhores
- Ferramenta recomendada: Aplicativo Y para gerenciar este processo
- Dica rápida: Comece com pequenos passos diários

## Enquete
O que você acha sobre ${topic}?
[ ] Extremamente importante
[ ] Moderadamente relevante
[ ] Preciso aprender mais
[ ] Não é prioridade para mim

## Chamada para Ação
Compartilhe sua experiência com ${topic} nos comentários! Se este conteúdo foi útil, salve para consultar depois.

#${topic.replace(/\s+/g, '')} #Conteúdo${platform} #Dicas${contentType}

---
Este é um conteúdo de DEMONSTRAÇÃO. Para conteúdo real, configure as chaves de API nas variáveis de ambiente.`;
  }

  async generateWithOpenAI(systemPrompt, userPrompt) {
    if (!this.openai) {
      throw new Error('Serviço OpenAI não inicializado');
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: this.status.openai.model || 'gpt-4',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: config.ai?.openai?.maxTokens || 3000,
        temperature: config.ai?.openai?.temperature || 0.7
      });

      if (!response || !response.choices || !response.choices[0]) {
        throw new Error('Resposta inválida do OpenAI');
      }

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Erro na API OpenAI:', error);
      throw new Error(`Falha na geração com OpenAI: ${error.message}`);
    }
  }

  async generateWithAnthropic(systemPrompt, userPrompt) {
    if (!this.anthropic) {
      throw new Error('Serviço Anthropic não inicializado');
    }

    try {
      const response = await this.anthropic.messages.create({
        model: this.status.anthropic.model || 'claude-3-sonnet',
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        max_tokens: config.ai?.anthropic?.maxTokens || 4000
      });

      if (!response || !response.content || !response.content[0]) {
        throw new Error('Resposta inválida do Anthropic');
      }

      return response.content[0].text;
    } catch (error) {
      console.error('Erro na API Anthropic:', error);
      throw new Error(`Falha na geração com Anthropic: ${error.message}`);
    }
  }

  buildSystemPrompt(platform, contentType, tone) {
    return `Você é um especialista em criação de conteúdo viral seguindo a metodologia Soulclap.

DIRETRIZES PRINCIPAIS:
- Crie ganchos irresistíveis e headlines magnéticos
- Aplique o princípio 80/20 (20% dos insights geram 80% do valor)
- Conteúdo emocional e conectivo
- Use storytelling e exemplos práticos
- CTAs estratégicos
- Otimize para SEO e engajamento

ESTRUTURA SOULCLAP:
1. Headline & Hook (curiosidade, surpresa ou questionamento)
2. Resumo Simplificado (2-3 linhas com emojis)
3. Glossário Acessível 
4. Texto principal com blocos didáticos
5. Exemplos práticos e ferramentas
6. Quiz interativo ou enquete
7. CTA variado e envolvente

Tom: ${tone}
Plataforma: ${platform}
Tipo: ${contentType}

${this.getPlatformSpecificInstructions(platform)}`;
  }

  buildUserPrompt(params) {
    const {
      topic,
      keywords,
      targetAudience,
      callToAction,
      includeHashtags,
      platform,
      contentType,
      additionalContext,
      referenceContent
    } = params;

    let prompt = `
Tópico: ${topic}
${keywords.length > 0 ? `Palavras-chave: ${keywords.join(', ')}` : ''}
${targetAudience ? `Público-alvo: ${targetAudience}` : ''}
${callToAction ? `Call-to-Action: ${callToAction}` : ''}`;

    // Adicionar conteúdo de referência se fornecido
    if (referenceContent) {
      if (referenceContent.youtubeLink) {
        prompt += `\n\n🎥 Vídeo de referência no YouTube: ${referenceContent.youtubeLink}`;
        prompt += `\nAnalise e extraia insights do vídeo para criar conteúdo relacionado.`;
      }
      
      if (referenceContent.webLink) {
        prompt += `\n\n🔗 Link de referência: ${referenceContent.webLink}`;
        prompt += `\nUse este conteúdo como inspiração e referência.`;
      }
      
      if (referenceContent.referenceText) {
        prompt += `\n\n📄 Texto de referência:\n${referenceContent.referenceText}`;
        prompt += `\nUse este texto como base e inspiração para criar o novo conteúdo.`;
      }
      
      if (referenceContent.uploadedFile) {
        prompt += `\n\n📎 Arquivo anexado: ${referenceContent.uploadedFile}`;
        prompt += `\nConsidere o conteúdo deste arquivo na criação.`;
      }
    }

    if (additionalContext) {
      prompt += `\n\n📝 Contexto adicional:\n${additionalContext}`;
    }

    prompt += `\n\nCrie conteúdo completo seguindo RIGOROSAMENTE o template Soulclap,
incluindo todos os elementos para máximo engajamento e potencial viral.
${includeHashtags ? 'Inclua hashtags estratégicas relevantes.' : ''}
Adapte perfeitamente para ${platform} e formato ${contentType}.

${referenceContent && Object.keys(referenceContent).some(key => referenceContent[key]) ? 
'IMPORTANTE: Use o conteúdo de referência fornecido para criar algo original e melhorado, mantendo a relevância com o tópico principal.' : ''}`;

    return prompt;
  }

  getPlatformSpecificInstructions(platform) {
    const instructions = {
      instagram: '- Use emojis estrategicamente\n- Crie hooks visuais\n- Máximo 2200 caracteres\n- Inclua call-to-action para stories',
      twitter: '- Seja conciso e impactante\n- Use threads se necessário\n- Máximo 280 caracteres por tweet\n- Otimize para retweets',
      linkedin: '- Tom profissional mas acessível\n- Inclua insights de carreira\n- Use dados e estatísticas\n- Convide para conexão',
      youtube: '- Crie roteiro com ganchos\n- Inclua timestamps\n- Otimize título para CTR\n- Sugira thumbnails',
      blog: '- Estrutura SEO otimizada\n- Subtítulos descritivos\n- Inclua meta description\n- Call-to-actions distribuídos',
      email: '- Subject line irresistível\n- Personalização estratégica\n- Estrutura scannable\n- CTA claro e único'
    };

    return instructions[platform] || '- Adapte para máximo engajamento e potencial viral na plataforma especificada';
  }

  calculateViralScore(content, platform) {
    let score = 50; // Pontuação base

    // Otimização de comprimento
    const wordCount = content.split(' ').length;
    if (platform === 'twitter' && wordCount <= 40) score += 10;
    if (platform === 'instagram' && wordCount >= 100 && wordCount <= 300) score += 10;
    if (platform === 'linkedin' && wordCount >= 200 && wordCount <= 500) score += 10;

    // Elementos de engajamento
    if (content.includes('?')) score += 5; // Perguntas aumentam o engajamento
    if (content.includes('!')) score += 3; // Excitação
    if (/\d+/.test(content)) score += 5; // Números e estatísticas
    if (/💡|🚀|✨|🔥|💪|🎯|⚡|🌟/.test(content)) score += 7; // Emojis de poder

    // Hashtags
    const hashtagCount = (content.match(/#\w+/g) || []).length;
    if (hashtagCount >= 3 && hashtagCount <= 10) score += 8;

    // Detecção de call-to-action
    if (/comentar|compartilh|curtir|seguir|salvar|clique|acesse/i.test(content)) score += 10;

    // Elementos de storytelling
    if (/era uma vez|imagine|lembro|história|experiência/i.test(content)) score += 8;

    return Math.min(Math.max(score, 0), 100);
  }

  async generateSuggestions(topic, platform = 'universal') {
    this.metrics.totalRequests++;
    const startTime = Date.now();
    
    try {
      // Verificar disponibilidade
      if (!this.isAvailable()) {
        throw new Error('Serviços de IA não disponíveis. Configure as chaves de API ou ative o modo de demonstração.');
      }

      // Gerar chave de cache
      const cacheKey = this.generateCacheKey('suggestions', { topic, platform });
      
      // Verificar cache
      const cachedResult = this.cache.get(cacheKey);
      if (cachedResult) {
        this.metrics.cacheHits++;
        console.log('🔄 Sugestões recuperadas do cache');
        
        // Atualizar métricas
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        this.updateResponseTimeMetric(responseTime);
        
        return cachedResult;
      }
      
      this.metrics.cacheMisses++;

      const prompt = `Gere 5 sugestões de títulos virais para o tópico "${topic}" na plataforma ${platform}.

Cada título deve:
- Ser irresistível e gerar curiosidade
- Usar números, listas ou perguntas quando apropriado
- Ser otimizado para a plataforma específica
- Ter potencial viral alto

Formato: Lista numerada simples.`;

      let response;
      
      // Modo de demonstração
      if (this.status.demo?.available) {
        response = this.generateDemoSuggestions(topic, platform);
      }
      // Tentar OpenAI primeiro
      else if (this.status.openai?.available && this.openai) {
        const result = await this.openai.chat.completions.create({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 500,
          temperature: 0.8
        });
        response = result.choices[0].message.content;
      } 
      // Fallback para Anthropic
      else if (this.status.anthropic?.available && this.anthropic) {
        const result = await this.anthropic.messages.create({
          model: 'claude-3-haiku-20240307',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 800
        });
        response = result.content[0].text;
      } 
      else {
        throw new Error('Nenhum serviço de IA está funcionando');
      }

      const titles = response
        .split('\n')
        .filter(line => line.match(/^\d+\./))
        .map(line => line.replace(/^\d+\.\s*/, '').trim())
        .slice(0, 5);

      const result = {
        titles,
        estimatedViralScore: Math.floor(Math.random() * 20) + 70, // Faixa 70-90
        platform
      };
      
      // Salvar no cache
      this.cache.set(cacheKey, result);
      
      // Atualizar métricas
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      this.updateResponseTimeMetric(responseTime);
      
      return result;
    } catch (error) {
      // Atualizar métricas de erro
      this.metrics.errors++;
      this.metrics.lastError = error.message;
      
      console.error('Erro ao gerar sugestões:', error);
      throw new Error(`Erro ao gerar sugestões: ${error.message}`);
    }
  }

  generateDemoSuggestions(topic, platform) {
    // Gerar sugestões de demonstração baseadas no tópico e plataforma
    return `1. 7 Segredos Surpreendentes sobre ${topic} que Ninguém te Contou
2. Como ${topic} Transformou Minha Vida em Apenas 30 Dias
3. O Guia Definitivo para Dominar ${topic} em 2025
4. Você Está Cometendo Estes 5 Erros com ${topic}?
5. A Estratégia de ${topic} que Viralizou e Gerou Milhões de Visualizações`;
  }

  // Funções auxiliares
  
  generateCacheKey(type, params) {
    // Criar uma string ordenada e consistente dos parâmetros
    const paramsStr = Object.entries(params)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}:${value}`)
      .join('|');
    
    return `${type}_${paramsStr}`;
  }
  
  updateResponseTimeMetric(newTime) {
    // Atualizar média de tempo de resposta com peso móvel
    const totalRequests = this.metrics.cacheHits + this.metrics.cacheMisses;
    if (totalRequests <= 1) {
      this.metrics.averageResponseTime = newTime;
    } else {
      // Média ponderada com mais peso para valores recentes
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * 0.7) + (newTime * 0.3);
    }
  }
  
  // Limpar cache manualmente se necessário
  clearCache() {
    const keysCount = this.cache.keys().length;
    this.cache.flushAll();
    console.log(`🧹 Cache limpo: ${keysCount} entradas removidas`);
    return { success: true, entriesRemoved: keysCount };
  }
}

// Exportar uma única instância para reutilização
const aiService = new AIService();
module.exports = aiService;
