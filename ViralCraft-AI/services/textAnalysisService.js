// services/textAnalysisService.js
/**
 * Serviço para análise de texto e conteúdo
 * Responsável por analisar, pontuar e otimizar conteúdo textual
 */
class TextAnalysisService {
  /**
   * Analisa um conteúdo textual
   * @param {string} content - Conteúdo a ser analisado
   * @param {string} platform - Plataforma alvo (twitter, instagram, etc)
   * @returns {Object} Resultado da análise
   */
  analyzeContent(content, platform) {
    return {
      wordCount: this.countWords(content),
      characterCount: content.length,
      estimatedReadTime: this.calculateReadTime(content),
      viralScore: this.calculateViralScore(content, platform),
      sentiment: this.analyzeSentiment(content),
      suggestions: this.getOptimizationSuggestions(content, platform)
    };
  }

  /**
   * Conta palavras em um texto
   * @param {string} text - Texto para contagem
   * @returns {number} Número de palavras
   */
  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Calcula tempo estimado de leitura
   * @param {string} text - Texto para cálculo
   * @param {number} wordsPerMinute - Palavras por minuto (padrão: 200)
   * @returns {number} Tempo em minutos
   */
  calculateReadTime(text, wordsPerMinute = 200) {
    const wordCount = this.countWords(text);
    return Math.ceil(wordCount / wordsPerMinute);
  }

  /**
   * Calcula pontuação de viralidade do conteúdo
   * @param {string} content - Conteúdo para análise
   * @param {string} platform - Plataforma alvo
   * @returns {number} Pontuação de 0 a 100
   */
  calculateViralScore(content, platform) {
    let score = 60; // Pontuação base
    
    // Otimização de comprimento
    const wordCount = this.countWords(content);
    const platformOptimal = {
      twitter: { min: 15, max: 40 },
      instagram: { min: 100, max: 300 },
      linkedin: { min: 200, max: 500 },
      blog: { min: 800, max: 2000 }
    };
    
    const optimal = platformOptimal[platform] || { min: 100, max: 500 };
    if (wordCount >= optimal.min && wordCount <= optimal.max) {
      score += 15;
    }
    
    // Gatilhos emocionais
    const emotionalWords = [
      'transformar', 'descobrir', 'revolucionar', 'impactar', 'inspirar',
      'segredo', 'incrível', 'surpreendente', 'exclusivo', 'garantido'
    ];
    
    const emotionalCount = emotionalWords.filter(word => 
      content.toLowerCase().includes(word)
    ).length;
    
    score += Math.min(emotionalCount * 3, 15);
    
    // Elementos de engajamento
    if (content.includes('?')) score += 5; // Perguntas
    if (/[🎯💡🚀✨⚡🔥💪🎉]/g.test(content)) score += 8; // Emojis de impacto
    if (content.includes('#')) score += 5; // Hashtags
    if (/compartilhe|comente|marque|salve/i.test(content)) score += 10; // CTAs
    
    // Elementos estruturais
    if (content.includes('•') || content.includes('-')) score += 5; // Listas
    if (content.split('\n').length > 3) score += 5; // Formatação
    
    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Analisa o sentimento do texto
   * @param {string} content - Conteúdo para análise
   * @returns {string} Sentimento (positive, negative, neutral)
   */
  analyzeSentiment(content) {
    // Análise simples de sentimento
    const positiveWords = [
      'excelente', 'incrível', 'fantástico', 'perfeito', 'sucesso',
      'ótimo', 'maravilhoso', 'espetacular', 'extraordinário', 'feliz'
    ];
    
    const negativeWords = [
      'problema', 'dificuldade', 'erro', 'fracasso', 'impossível',
      'ruim', 'péssimo', 'terrível', 'horrível', 'falha'
    ];
    
    const words = content.toLowerCase().split(/\s+/);
    const positiveCount = positiveWords.filter(word => words.includes(word)).length;
    const negativeCount = negativeWords.filter(word => words.includes(word)).length;
    
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > positiveCount) return 'negative';
    return 'neutral';
  }

  /**
   * Gera sugestões de otimização para o conteúdo
   * @param {string} content - Conteúdo para análise
   * @param {string} platform - Plataforma alvo
   * @returns {Array} Lista de sugestões
   */
  getOptimizationSuggestions(content, platform) {
    const suggestions = [];
    const wordCount = this.countWords(content);
    
    // Sugestões específicas por plataforma
    if (platform === 'twitter' && wordCount > 40) {
      suggestions.push('Considere criar um thread para melhor engajamento');
    }
    
    if (platform === 'instagram' && wordCount < 50) {
      suggestions.push('Adicione mais contexto para aumentar o engajamento');
    }
    
    if (platform === 'linkedin' && wordCount < 100) {
      suggestions.push('Conteúdos mais detalhados tendem a performar melhor no LinkedIn');
    }
    
    // Sugestões gerais
    if (!content.includes('?')) {
      suggestions.push('Adicione uma pergunta para aumentar engajamento');
    }
    
    if (!/[🎯💡🚀✨⚡]/g.test(content)) {
      suggestions.push('Use emojis estratégicos para destacar pontos importantes');
    }
    
    if (!/#/g.test(content) && platform !== 'email') {
      suggestions.push('Inclua hashtags relevantes para aumentar alcance');
    }
    
    if (content.split('\n').length < 3) {
      suggestions.push('Melhore a formatação com quebras de linha para facilitar a leitura');
    }
    
    return suggestions;
  }
}

module.exports = new TextAnalysisService();
