/**
 * Configuração de Otimização de Queries e Modelos
 * 
 * Este arquivo implementa otimizações para consultas ao banco de dados e modelos,
 * incluindo lazy loading para relacionamentos, paginação eficiente e consultas otimizadas.
 */

const { Sequelize, Op } = require('sequelize');
const cacheService = require('./cacheService');

class QueryOptimizerService {
  constructor() {
    this.queryStats = new Map();
    this.slowQueryThreshold = 100; // ms
    this.queryCache = {
      enabled: true,
      ttl: 300 // 5 minutos em segundos
    };
  }

  /**
   * Otimiza uma consulta ao banco de dados
   * @param {Object} model - Modelo Sequelize
   * @param {Object} options - Opções de consulta
   * @param {String} queryName - Nome identificador da consulta para estatísticas
   * @returns {Promise<Object>} Resultado da consulta
   */
  async optimizeQuery(model, options, queryName = 'unnamed') {
    const startTime = Date.now();
    const queryId = `${model.name}:${queryName}`;
    
    try {
      // Verificar cache se habilitado
      if (this.queryCache.enabled && options.useCache !== false) {
        const cacheKey = this._generateCacheKey(model.name, options);
        const cachedResult = await cacheService.get('db-queries', cacheKey);
        
        if (cachedResult) {
          this._recordQueryStats(queryId, 0, true);
          return cachedResult;
        }
      }
      
      // Aplicar otimizações às opções de consulta
      const optimizedOptions = this._optimizeQueryOptions(options);
      
      // Executar consulta
      const result = await model.findAll(optimizedOptions);
      const duration = Date.now() - startTime;
      
      // Registrar estatísticas
      this._recordQueryStats(queryId, duration, false);
      
      // Verificar se é uma consulta lenta
      if (duration > this.slowQueryThreshold) {
        console.warn(`⚠️ Consulta lenta detectada (${duration}ms): ${queryId}`);
        this._analyzeSlowQuery(model, optimizedOptions, queryId, duration);
      }
      
      // Armazenar em cache se habilitado
      if (this.queryCache.enabled && options.useCache !== false) {
        const cacheKey = this._generateCacheKey(model.name, options);
        const ttl = options.cacheTTL || this.queryCache.ttl;
        await cacheService.set('db-queries', cacheKey, result, ttl);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Erro ao executar consulta otimizada (${queryId}):`, error.message);
      throw error;
    }
  }
  
  /**
   * Implementa paginação eficiente
   * @param {Object} model - Modelo Sequelize
   * @param {Object} options - Opções de consulta
   * @param {Number} page - Número da página (começando em 1)
   * @param {Number} pageSize - Tamanho da página
   * @param {String} queryName - Nome identificador da consulta
   * @returns {Promise<Object>} Resultado paginado
   */
  async paginateQuery(model, options, page = 1, pageSize = 20, queryName = 'paginated') {
    const startTime = Date.now();
    const queryId = `${model.name}:${queryName}:page${page}`;
    
    try {
      // Verificar cache
      if (this.queryCache.enabled && options.useCache !== false) {
        const cacheKey = this._generateCacheKey(model.name, { ...options, page, pageSize });
        const cachedResult = await cacheService.get('db-pagination', cacheKey);
        
        if (cachedResult) {
          return cachedResult;
        }
      }
      
      // Calcular offset
      const offset = (page - 1) * pageSize;
      
      // Otimizar opções
      const optimizedOptions = this._optimizeQueryOptions({
        ...options,
        limit: pageSize,
        offset
      });
      
      // Executar consulta de contagem e dados em paralelo
      const [count, rows] = await Promise.all([
        model.count({ where: options.where }),
        model.findAll(optimizedOptions)
      ]);
      
      // Calcular metadados de paginação
      const totalPages = Math.ceil(count / pageSize);
      const hasNext = page < totalPages;
      const hasPrevious = page > 1;
      
      const result = {
        data: rows,
        pagination: {
          total: count,
          page,
          pageSize,
          totalPages,
          hasNext,
          hasPrevious
        }
      };
      
      // Registrar estatísticas
      const duration = Date.now() - startTime;
      this._recordQueryStats(queryId, duration, false);
      
      // Armazenar em cache
      if (this.queryCache.enabled && options.useCache !== false) {
        const cacheKey = this._generateCacheKey(model.name, { ...options, page, pageSize });
        const ttl = options.cacheTTL || this.queryCache.ttl;
        await cacheService.set('db-pagination', cacheKey, result, ttl);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Erro ao executar consulta paginada (${queryId}):`, error.message);
      throw error;
    }
  }
  
  /**
   * Implementa lazy loading otimizado para relacionamentos
   * @param {Object} instance - Instância do modelo
   * @param {String} association - Nome da associação
   * @param {Object} options - Opções de consulta
   * @returns {Promise<Object>} Dados da associação
   */
  async lazyLoadAssociation(instance, association, options = {}) {
    if (!instance || !association) {
      throw new Error('Instância e associação são obrigatórios');
    }
    
    const startTime = Date.now();
    const modelName = instance.constructor.name;
    const queryId = `${modelName}:lazyLoad:${association}`;
    
    try {
      // Verificar cache
      if (this.queryCache.enabled && options.useCache !== false) {
        const cacheKey = `${modelName}:${instance.id}:${association}`;
        const cachedResult = await cacheService.get('db-associations', cacheKey);
        
        if (cachedResult) {
          return cachedResult;
        }
      }
      
      // Verificar se o método getter existe
      const getterMethod = `get${association.charAt(0).toUpperCase() + association.slice(1)}`;
      if (typeof instance[getterMethod] !== 'function') {
        throw new Error(`Associação '${association}' não encontrada no modelo ${modelName}`);
      }
      
      // Otimizar opções
      const optimizedOptions = this._optimizeQueryOptions(options);
      
      // Carregar associação
      const result = await instance[getterMethod](optimizedOptions);
      
      // Registrar estatísticas
      const duration = Date.now() - startTime;
      this._recordQueryStats(queryId, duration, false);
      
      // Armazenar em cache
      if (this.queryCache.enabled && options.useCache !== false) {
        const cacheKey = `${modelName}:${instance.id}:${association}`;
        const ttl = options.cacheTTL || this.queryCache.ttl;
        await cacheService.set('db-associations', cacheKey, result, ttl);
      }
      
      return result;
    } catch (error) {
      console.error(`❌ Erro ao carregar associação (${queryId}):`, error.message);
      throw error;
    }
  }
  
  /**
   * Invalida cache para um modelo específico
   * @param {String} modelName - Nome do modelo
   * @returns {Promise<Boolean>} Sucesso da operação
   */
  async invalidateModelCache(modelName) {
    try {
      await Promise.all([
        cacheService.clearNamespace(`db-queries:${modelName}`),
        cacheService.clearNamespace(`db-pagination:${modelName}`),
        cacheService.clearNamespace(`db-associations:${modelName}`)
      ]);
      
      return true;
    } catch (error) {
      console.error(`❌ Erro ao invalidar cache do modelo ${modelName}:`, error.message);
      return false;
    }
  }
  
  /**
   * Obtém estatísticas de consultas
   * @returns {Object} Estatísticas de consultas
   */
  getQueryStats() {
    const stats = {
      queries: [],
      totalQueries: 0,
      averageDuration: 0,
      slowQueries: 0,
      cacheHits: 0
    };
    
    let totalDuration = 0;
    
    this.queryStats.forEach((value, key) => {
      stats.queries.push({
        query: key,
        count: value.count,
        averageDuration: value.totalDuration / value.count,
        slowCount: value.slowCount,
        cacheHits: value.cacheHits
      });
      
      stats.totalQueries += value.count;
      totalDuration += value.totalDuration;
      stats.slowQueries += value.slowCount;
      stats.cacheHits += value.cacheHits;
    });
    
    stats.averageDuration = stats.totalQueries > 0 
      ? totalDuration / stats.totalQueries 
      : 0;
    
    return stats;
  }
  
  /**
   * Otimiza opções de consulta
   * @private
   * @param {Object} options - Opções originais
   * @returns {Object} Opções otimizadas
   */
  _optimizeQueryOptions(options) {
    const optimized = { ...options };
    
    // Garantir que apenas os campos necessários sejam selecionados
    if (!optimized.attributes && !optimized.include) {
      // Se não há seleção específica, não modificar
      return optimized;
    }
    
    // Otimizar includes para evitar N+1
    if (optimized.include) {
      optimized.include = this._optimizeIncludes(optimized.include);
    }
    
    // Adicionar índices para ordenação quando aplicável
    if (optimized.order && optimized.order.length > 0) {
      // Não modificar a ordem, apenas garantir que índices existam
      // Isso é feito no nível do modelo, não aqui
    }
    
    return optimized;
  }
  
  /**
   * Otimiza includes para evitar problema N+1
   * @private
   * @param {Array|Object} includes - Includes originais
   * @returns {Array} Includes otimizados
   */
  _optimizeIncludes(includes) {
    if (!includes) return includes;
    
    const processInclude = (include) => {
      const result = { ...include };
      
      // Aplicar separate: true apenas para coleções grandes
      if (result.association && 
          result.association.associationType === 'HasMany' && 
          !result.limit) {
        result.separate = true;
      }
      
      // Processar includes aninhados
      if (result.include) {
        result.include = Array.isArray(result.include)
          ? result.include.map(processInclude)
          : processInclude(result.include);
      }
      
      return result;
    };
    
    return Array.isArray(includes)
      ? includes.map(processInclude)
      : processInclude(includes);
  }
  
  /**
   * Gera chave de cache para consulta
   * @private
   * @param {String} modelName - Nome do modelo
   * @param {Object} options - Opções de consulta
   * @returns {String} Chave de cache
   */
  _generateCacheKey(modelName, options) {
    // Criar cópia simplificada das opções para chave de cache
    const keyOptions = {};
    
    // Incluir apenas propriedades relevantes para a chave
    if (options.where) keyOptions.where = options.where;
    if (options.order) keyOptions.order = options.order;
    if (options.limit) keyOptions.limit = options.limit;
    if (options.offset) keyOptions.offset = options.offset;
    if (options.attributes) keyOptions.attributes = options.attributes;
    
    // Para includes, simplificar para evitar objetos circulares
    if (options.include) {
      keyOptions.include = this._simplifyIncludesForCache(options.include);
    }
    
    // Adicionar paginação se presente
    if (options.page) keyOptions.page = options.page;
    if (options.pageSize) keyOptions.pageSize = options.pageSize;
    
    return `${modelName}:${JSON.stringify(keyOptions)}`;
  }
  
  /**
   * Simplifica includes para uso em chaves de cache
   * @private
   * @param {Array|Object} includes - Includes originais
   * @returns {Array} Includes simplificados
   */
  _simplifyIncludesForCache(includes) {
    if (!includes) return [];
    
    const simplify = (include) => {
      if (typeof include === 'string') return include;
      
      const result = {};
      
      // Incluir apenas o modelo ou associação
      if (include.model) {
        result.model = include.model.name;
      } else if (include.association) {
        result.association = include.association;
      }
      
      // Incluir where se presente
      if (include.where) {
        result.where = include.where;
      }
      
      // Processar includes aninhados
      if (include.include) {
        result.include = Array.isArray(include.include)
          ? include.include.map(simplify)
          : simplify(include.include);
      }
      
      return result;
    };
    
    return Array.isArray(includes)
      ? includes.map(simplify)
      : simplify(includes);
  }
  
  /**
   * Registra estatísticas de consulta
   * @private
   * @param {String} queryId - Identificador da consulta
   * @param {Number} duration - Duração em ms
   * @param {Boolean} fromCache - Se veio do cache
   */
  _recordQueryStats(queryId, duration, fromCache) {
    if (!this.queryStats.has(queryId)) {
      this.queryStats.set(queryId, {
        count: 0,
        totalDuration: 0,
        slowCount: 0,
        cacheHits: 0
      });
    }
    
    const stats = this.queryStats.get(queryId);
    stats.count++;
    
    if (fromCache) {
      stats.cacheHits++;
    } else {
      stats.totalDuration += duration;
      
      if (duration > this.slowQueryThreshold) {
        stats.slowCount++;
      }
    }
  }
  
  /**
   * Analisa consulta lenta para sugerir otimizações
   * @private
   * @param {Object} model - Modelo Sequelize
   * @param {Object} options - Opções de consulta
   * @param {String} queryId - Identificador da consulta
   * @param {Number} duration - Duração em ms
   */
  _analyzeSlowQuery(model, options, queryId, duration) {
    const suggestions = [];
    
    // Verificar se há índices para where
    if (options.where) {
      const whereFields = Object.keys(options.where);
      suggestions.push(`Verificar índices para campos: ${whereFields.join(', ')}`);
    }
    
    // Verificar se há muitos includes
    if (options.include && Array.isArray(options.include) && options.include.length > 3) {
      suggestions.push(`Considerar separar consulta com ${options.include.length} includes`);
    }
    
    // Verificar se há limit
    if (!options.limit) {
      suggestions.push('Adicionar limit para limitar resultados');
    }
    
    // Verificar se há muitos campos selecionados
    if (!options.attributes) {
      suggestions.push('Selecionar apenas campos necessários com attributes');
    }
    
    console.warn(`Sugestões para otimizar consulta lenta ${queryId} (${duration}ms):`);
    suggestions.forEach(suggestion => console.warn(`- ${suggestion}`));
  }
}

module.exports = new QueryOptimizerService();
