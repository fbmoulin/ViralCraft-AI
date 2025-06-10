/**
 * Implementação de Cache Distribuído com Redis
 * 
 * Este serviço implementa um sistema de cache distribuído com Redis,
 * com fallback para cache em memória quando o Redis não está disponível.
 */

const Redis = require('ioredis');
const { performance } = require('perf_hooks');
const fs = require('fs').promises;
const path = require('path');

class CacheService {
  constructor() {
    this.redisClient = null;
    this.fallbackCache = new Map();
    this.isRedisAvailable = false;
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
    
    this.options = {
      ttl: 3600, // 1 hora em segundos
      persistMetrics: true,
      metricsInterval: 300000, // 5 minutos em ms
      metricsPath: path.join(process.cwd(), 'data', 'cache-metrics.json')
    };
  }
  
  /**
   * Inicializa o serviço de cache
   * @param {Object} options - Opções de configuração
   * @returns {Boolean} Sucesso da inicialização
   */
  async initialize(options = {}) {
    try {
      this.options = { ...this.options, ...options };
      
      // Tentar conectar ao Redis
      try {
        this.redisClient = new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379,
          password: process.env.REDIS_PASSWORD || undefined,
          db: process.env.REDIS_DB || 0,
          retryStrategy: (times) => {
            const delay = Math.min(times * 50, 2000);
            return delay;
          },
          maxRetriesPerRequest: 3
        });
        
        // Verificar conexão
        await this.redisClient.ping();
        this.isRedisAvailable = true;
        console.log('✅ Conectado ao Redis com sucesso');
      } catch (error) {
        this.isRedisAvailable = false;
        console.warn('⚠️ Redis não disponível, usando cache em memória como fallback');
        console.warn(`   Erro: ${error.message}`);
      }
      
      // Carregar métricas anteriores
      if (this.options.persistMetrics) {
        await this._loadMetrics();
      }
      
      // Configurar persistência periódica de métricas
      if (this.options.persistMetrics && this.options.metricsInterval > 0) {
        this._setupMetricsPersistence();
      }
      
      return true;
    } catch (error) {
      console.error('❌ Erro ao inicializar serviço de cache:', error.message);
      return false;
    }
  }
  
  /**
   * Gera uma chave de cache
   * @param {String} namespace - Namespace da chave
   * @param {String} key - Chave
   * @returns {String} Chave completa
   */
  generateKey(namespace, key) {
    return `${namespace}:${key}`;
  }
  
  /**
   * Obtém um valor do cache
   * @param {String} namespace - Namespace da chave
   * @param {String} key - Chave
   * @returns {Promise<*>} Valor armazenado ou null
   */
  async get(namespace, key) {
    const fullKey = this.generateKey(namespace, key);
    const startTime = performance.now();
    
    try {
      let value = null;
      
      // Tentar obter do Redis
      if (this.isRedisAvailable) {
        const redisValue = await this.redisClient.get(fullKey);
        
        if (redisValue) {
          value = JSON.parse(redisValue);
          this.metrics.hits++;
        }
      }
      
      // Fallback para cache em memória
      if (!value) {
        value = this.fallbackCache.get(fullKey);
        
        if (value) {
          this.metrics.hits++;
        } else {
          this.metrics.misses++;
        }
      }
      
      return value;
    } catch (error) {
      console.error(`❌ Erro ao obter valor do cache (${fullKey}):`, error.message);
      this.metrics.errors++;
      
      // Tentar fallback
      return this.fallbackCache.get(fullKey);
    } finally {
      const duration = performance.now() - startTime;
      if (duration > 100) {
        console.warn(`⚠️ Operação de cache lenta (${duration.toFixed(2)}ms): GET ${fullKey}`);
      }
    }
  }
  
  /**
   * Armazena um valor no cache
   * @param {String} namespace - Namespace da chave
   * @param {String} key - Chave
   * @param {*} value - Valor a ser armazenado
   * @param {Number} ttl - Tempo de vida em segundos (opcional)
   * @returns {Promise<Boolean>} Sucesso da operação
   */
  async set(namespace, key, value, ttl = null) {
    const fullKey = this.generateKey(namespace, key);
    const expiry = ttl || this.options.ttl;
    const startTime = performance.now();
    
    try {
      // Armazenar no Redis
      if (this.isRedisAvailable) {
        await this.redisClient.set(
          fullKey,
          JSON.stringify(value),
          'EX',
          expiry
        );
      }
      
      // Armazenar no fallback
      this.fallbackCache.set(fullKey, value);
      
      // Configurar expiração no fallback
      if (expiry > 0) {
        setTimeout(() => {
          this.fallbackCache.delete(fullKey);
        }, expiry * 1000);
      }
      
      this.metrics.sets++;
      return true;
    } catch (error) {
      console.error(`❌ Erro ao armazenar valor no cache (${fullKey}):`, error.message);
      this.metrics.errors++;
      
      // Garantir que pelo menos o fallback funcione
      this.fallbackCache.set(fullKey, value);
      return false;
    } finally {
      const duration = performance.now() - startTime;
      if (duration > 100) {
        console.warn(`⚠️ Operação de cache lenta (${duration.toFixed(2)}ms): SET ${fullKey}`);
      }
    }
  }
  
  /**
   * Remove um valor do cache
   * @param {String} namespace - Namespace da chave
   * @param {String} key - Chave
   * @returns {Promise<Boolean>} Sucesso da operação
   */
  async delete(namespace, key) {
    const fullKey = this.generateKey(namespace, key);
    const startTime = performance.now();
    
    try {
      // Remover do Redis
      if (this.isRedisAvailable) {
        await this.redisClient.del(fullKey);
      }
      
      // Remover do fallback
      this.fallbackCache.delete(fullKey);
      
      this.metrics.deletes++;
      return true;
    } catch (error) {
      console.error(`❌ Erro ao remover valor do cache (${fullKey}):`, error.message);
      this.metrics.errors++;
      
      // Garantir que pelo menos o fallback funcione
      this.fallbackCache.delete(fullKey);
      return false;
    } finally {
      const duration = performance.now() - startTime;
      if (duration > 100) {
        console.warn(`⚠️ Operação de cache lenta (${duration.toFixed(2)}ms): DELETE ${fullKey}`);
      }
    }
  }
  
  /**
   * Limpa todos os valores de um namespace
   * @param {String} namespace - Namespace a ser limpo
   * @returns {Promise<Boolean>} Sucesso da operação
   */
  async clearNamespace(namespace) {
    const startTime = performance.now();
    
    try {
      // Limpar no Redis
      if (this.isRedisAvailable) {
        const keys = await this.redisClient.keys(`${namespace}:*`);
        
        if (keys.length > 0) {
          await this.redisClient.del(...keys);
        }
      }
      
      // Limpar no fallback
      for (const key of this.fallbackCache.keys()) {
        if (key.startsWith(`${namespace}:`)) {
          this.fallbackCache.delete(key);
        }
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Erro ao limpar namespace do cache (${namespace}):`, error.message);
      this.metrics.errors++;
      
      // Garantir que pelo menos o fallback funcione
      for (const key of this.fallbackCache.keys()) {
        if (key.startsWith(`${namespace}:`)) {
          this.fallbackCache.delete(key);
        }
      }
      
      return false;
    } finally {
      const duration = performance.now() - startTime;
      if (duration > 100) {
        console.warn(`⚠️ Operação de cache lenta (${duration.toFixed(2)}ms): CLEAR ${namespace}`);
      }
    }
  }
  
  /**
   * Limpa todo o cache
   * @returns {Promise<Boolean>} Sucesso da operação
   */
  async clearAll() {
    const startTime = performance.now();
    
    try {
      // Limpar Redis
      if (this.isRedisAvailable) {
        await this.redisClient.flushdb();
      }
      
      // Limpar fallback
      this.fallbackCache.clear();
      
      return true;
    } catch (error) {
      console.error('❌ Erro ao limpar todo o cache:', error.message);
      this.metrics.errors++;
      
      // Garantir que pelo menos o fallback funcione
      this.fallbackCache.clear();
      
      return false;
    } finally {
      const duration = performance.now() - startTime;
      if (duration > 100) {
        console.warn(`⚠️ Operação de cache lenta (${duration.toFixed(2)}ms): CLEAR ALL`);
      }
    }
  }
  
  /**
   * Obtém estatísticas do cache
   * @returns {Object} Estatísticas
   */
  getStats() {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;
    
    return {
      status: {
        redisAvailable: this.isRedisAvailable,
        fallbackSize: this.fallbackCache.size
      },
      metrics: {
        ...this.metrics,
        total,
        hitRate: hitRate.toFixed(2)
      }
    };
  }
  
  /**
   * Carrega métricas anteriores
   * @private
   */
  async _loadMetrics() {
    try {
      const metricsDir = path.dirname(this.options.metricsPath);
      
      // Criar diretório se não existir
      await fs.mkdir(metricsDir, { recursive: true });
      
      // Tentar carregar métricas
      try {
        const data = await fs.readFile(this.options.metricsPath, 'utf8');
        const savedMetrics = JSON.parse(data);
        
        // Restaurar métricas
        this.metrics = {
          ...this.metrics,
          ...savedMetrics
        };
        
        console.log('✅ Métricas de cache carregadas');
      } catch (error) {
        if (error.code !== 'ENOENT') {
          console.warn('⚠️ Erro ao carregar métricas de cache:', error.message);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao preparar diretório de métricas:', error.message);
    }
  }
  
  /**
   * Configura persistência periódica de métricas
   * @private
   */
  _setupMetricsPersistence() {
    setInterval(async () => {
      try {
        const metricsDir = path.dirname(this.options.metricsPath);
        
        // Criar diretório se não existir
        await fs.mkdir(metricsDir, { recursive: true });
        
        // Salvar métricas
        await fs.writeFile(
          this.options.metricsPath,
          JSON.stringify(this.metrics, null, 2)
        );
      } catch (error) {
        console.error('❌ Erro ao persistir métricas de cache:', error.message);
      }
    }, this.options.metricsInterval);
  }
}

module.exports = new CacheService();
