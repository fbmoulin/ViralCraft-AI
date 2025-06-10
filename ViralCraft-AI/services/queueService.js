/**
 * Sistema de Filas e Processamento Assíncrono
 * 
 * Este arquivo implementa um sistema de filas para processamento assíncrono de tarefas pesadas,
 * com suporte a retry automático e monitoramento.
 */

const EventEmitter = require('events');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const cacheService = require('./cacheService');

class QueueService extends EventEmitter {
  constructor() {
    super();
    
    this.queues = new Map();
    this.workers = new Map();
    this.processing = new Map();
    
    this.defaultOptions = {
      concurrency: 2,
      retries: 3,
      retryDelay: 5000, // 5 segundos
      timeout: 60000,   // 1 minuto
      persistent: true
    };
    
    this.stats = {
      processed: 0,
      failed: 0,
      retried: 0,
      completed: 0
    };
    
    this.persistPath = path.join(process.cwd(), 'data', 'queues');
  }
  
  /**
   * Inicializa o serviço de filas
   */
  async initialize() {
    try {
      // Criar diretório de persistência se não existir
      await fs.mkdir(this.persistPath, { recursive: true });
      
      // Carregar filas persistentes
      if (this.defaultOptions.persistent) {
        await this._loadPersistedQueues();
      }
      
      console.log('✅ Serviço de filas inicializado');
      return true;
    } catch (error) {
      console.error('❌ Erro ao inicializar serviço de filas:', error.message);
      return false;
    }
  }
  
  /**
   * Cria uma nova fila
   * @param {String} name - Nome da fila
   * @param {Object} options - Opções da fila
   * @returns {Object} Fila criada
   */
  createQueue(name, options = {}) {
    if (this.queues.has(name)) {
      return this.queues.get(name);
    }
    
    const queueOptions = {
      ...this.defaultOptions,
      ...options,
      name
    };
    
    const queue = {
      name,
      tasks: [],
      options: queueOptions,
      paused: false,
      stats: {
        enqueued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        retried: 0
      }
    };
    
    this.queues.set(name, queue);
    
    // Registrar worker padrão se não existir
    if (!this.workers.has(name)) {
      this.registerWorker(name, async (task) => {
        console.warn(`⚠️ Nenhum worker registrado para a fila "${name}". Tarefa ignorada:`, task.data);
        return { success: false, error: 'Nenhum worker registrado' };
      });
    }
    
    console.log(`✅ Fila "${name}" criada`);
    return queue;
  }
  
  /**
   * Registra um worker para processar tarefas de uma fila
   * @param {String} queueName - Nome da fila
   * @param {Function} handler - Função para processar tarefas
   */
  registerWorker(queueName, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler deve ser uma função');
    }
    
    this.workers.set(queueName, handler);
    
    // Criar fila se não existir
    if (!this.queues.has(queueName)) {
      this.createQueue(queueName);
    }
    
    console.log(`✅ Worker registrado para fila "${queueName}"`);
  }
  
  /**
   * Adiciona uma tarefa à fila
   * @param {String} queueName - Nome da fila
   * @param {Object} data - Dados da tarefa
   * @param {Object} options - Opções da tarefa
   * @returns {String} ID da tarefa
   */
  async addTask(queueName, data, options = {}) {
    // Criar fila se não existir
    if (!this.queues.has(queueName)) {
      this.createQueue(queueName);
    }
    
    const queue = this.queues.get(queueName);
    
    const taskId = options.id || crypto.randomUUID();
    const task = {
      id: taskId,
      data,
      options: {
        ...queue.options,
        ...options
      },
      status: 'pending',
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    queue.tasks.push(task);
    queue.stats.enqueued++;
    
    // Persistir fila se necessário
    if (queue.options.persistent) {
      await this._persistQueue(queueName);
    }
    
    // Emitir evento
    this.emit('task:added', { queueName, taskId, data });
    
    // Processar fila se não estiver pausada
    if (!queue.paused) {
      this._processQueue(queueName);
    }
    
    return taskId;
  }
  
  /**
   * Processa a próxima tarefa da fila
   * @private
   * @param {String} queueName - Nome da fila
   */
  async _processQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) return;
    
    // Verificar se a fila está pausada
    if (queue.paused) return;
    
    // Verificar se há tarefas pendentes
    if (queue.tasks.length === 0) return;
    
    // Verificar concorrência
    const currentlyProcessing = this.processing.get(queueName) || 0;
    if (currentlyProcessing >= queue.options.concurrency) return;
    
    // Obter próxima tarefa pendente
    const taskIndex = queue.tasks.findIndex(task => task.status === 'pending');
    if (taskIndex === -1) return;
    
    const task = queue.tasks[taskIndex];
    task.status = 'processing';
    task.attempts++;
    task.updatedAt = new Date();
    task.startedAt = new Date();
    
    // Atualizar contadores
    queue.stats.processing++;
    this.processing.set(queueName, currentlyProcessing + 1);
    
    // Persistir estado atualizado
    if (queue.options.persistent) {
      await this._persistQueue(queueName);
    }
    
    // Emitir evento
    this.emit('task:processing', { queueName, taskId: task.id, attempts: task.attempts });
    
    try {
      // Obter handler
      const handler = this.workers.get(queueName);
      if (!handler) {
        throw new Error(`Nenhum worker registrado para a fila "${queueName}"`);
      }
      
      // Executar com timeout
      const result = await this._executeWithTimeout(
        () => handler(task.data, task),
        task.options.timeout
      );
      
      // Processar resultado
      task.status = 'completed';
      task.result = result;
      task.completedAt = new Date();
      task.updatedAt = new Date();
      
      // Atualizar contadores
      queue.stats.completed++;
      queue.stats.processing--;
      this.stats.completed++;
      this.stats.processed++;
      
      // Emitir evento
      this.emit('task:completed', { 
        queueName, 
        taskId: task.id, 
        result,
        duration: task.completedAt - task.startedAt
      });
    } catch (error) {
      // Verificar se deve tentar novamente
      if (task.attempts < task.options.retries) {
        task.status = 'pending';
        task.error = error.message;
        task.updatedAt = new Date();
        task.nextAttempt = new Date(Date.now() + task.options.retryDelay);
        
        // Atualizar contadores
        queue.stats.retried++;
        queue.stats.processing--;
        this.stats.retried++;
        
        // Emitir evento
        this.emit('task:retrying', { 
          queueName, 
          taskId: task.id, 
          error: error.message,
          attempts: task.attempts,
          maxRetries: task.options.retries,
          nextAttempt: task.nextAttempt
        });
        
        // Agendar próxima tentativa
        setTimeout(() => {
          this._processQueue(queueName);
        }, task.options.retryDelay);
      } else {
        // Falha definitiva
        task.status = 'failed';
        task.error = error.message;
        task.updatedAt = new Date();
        task.failedAt = new Date();
        
        // Atualizar contadores
        queue.stats.failed++;
        queue.stats.processing--;
        this.stats.failed++;
        this.stats.processed++;
        
        // Emitir evento
        this.emit('task:failed', { 
          queueName, 
          taskId: task.id, 
          error: error.message,
          attempts: task.attempts
        });
      }
    } finally {
      // Atualizar contador de processamento
      this.processing.set(queueName, (this.processing.get(queueName) || 1) - 1);
      
      // Persistir estado atualizado
      if (queue.options.persistent) {
        await this._persistQueue(queueName);
      }
      
      // Processar próxima tarefa
      setImmediate(() => this._processQueue(queueName));
    }
  }
  
  /**
   * Executa uma função com timeout
   * @private
   * @param {Function} fn - Função a ser executada
   * @param {Number} timeout - Timeout em ms
   * @returns {Promise} Resultado da função
   */
  async _executeWithTimeout(fn, timeout) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operação excedeu o timeout de ${timeout}ms`));
      }, timeout);
      
      Promise.resolve(fn())
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }
  
  /**
   * Pausa uma fila
   * @param {String} queueName - Nome da fila
   */
  pauseQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Fila "${queueName}" não encontrada`);
    }
    
    queue.paused = true;
    this.emit('queue:paused', { queueName });
    console.log(`⏸️ Fila "${queueName}" pausada`);
  }
  
  /**
   * Retoma uma fila
   * @param {String} queueName - Nome da fila
   */
  resumeQueue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Fila "${queueName}" não encontrada`);
    }
    
    queue.paused = false;
    this.emit('queue:resumed', { queueName });
    console.log(`▶️ Fila "${queueName}" retomada`);
    
    // Processar fila
    this._processQueue(queueName);
  }
  
  /**
   * Limpa uma fila
   * @param {String} queueName - Nome da fila
   * @param {String} status - Status das tarefas a serem removidas (opcional)
   */
  async clearQueue(queueName, status = null) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Fila "${queueName}" não encontrada`);
    }
    
    if (status) {
      // Remover apenas tarefas com status específico
      queue.tasks = queue.tasks.filter(task => task.status !== status);
    } else {
      // Remover todas as tarefas não em processamento
      queue.tasks = queue.tasks.filter(task => task.status === 'processing');
    }
    
    // Persistir estado atualizado
    if (queue.options.persistent) {
      await this._persistQueue(queueName);
    }
    
    this.emit('queue:cleared', { queueName, status });
    console.log(`🧹 Fila "${queueName}" limpa${status ? ` (status: ${status})` : ''}`);
  }
  
  /**
   * Obtém estatísticas de uma fila
   * @param {String} queueName - Nome da fila
   * @returns {Object} Estatísticas da fila
   */
  getQueueStats(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Fila "${queueName}" não encontrada`);
    }
    
    const pendingTasks = queue.tasks.filter(task => task.status === 'pending').length;
    const processingTasks = queue.tasks.filter(task => task.status === 'processing').length;
    const completedTasks = queue.tasks.filter(task => task.status === 'completed').length;
    const failedTasks = queue.tasks.filter(task => task.status === 'failed').length;
    
    return {
      name: queue.name,
      status: queue.paused ? 'paused' : 'active',
      tasks: {
        total: queue.tasks.length,
        pending: pendingTasks,
        processing: processingTasks,
        completed: completedTasks,
        failed: failedTasks
      },
      stats: { ...queue.stats },
      options: { ...queue.options }
    };
  }
  
  /**
   * Obtém estatísticas gerais do serviço de filas
   * @returns {Object} Estatísticas gerais
   */
  getStats() {
    const queueStats = {};
    let totalPending = 0;
    let totalProcessing = 0;
    
    this.queues.forEach((queue, name) => {
      const pendingTasks = queue.tasks.filter(task => task.status === 'pending').length;
      const processingTasks = queue.tasks.filter(task => task.status === 'processing').length;
      
      queueStats[name] = {
        pending: pendingTasks,
        processing: processingTasks,
        completed: queue.stats.completed,
        failed: queue.stats.failed
      };
      
      totalPending += pendingTasks;
      totalProcessing += processingTasks;
    });
    
    return {
      queues: this.queues.size,
      tasks: {
        pending: totalPending,
        processing: totalProcessing,
        completed: this.stats.completed,
        failed: this.stats.failed,
        retried: this.stats.retried,
        processed: this.stats.processed
      },
      queueStats
    };
  }
  
  /**
   * Persiste uma fila em disco
   * @private
   * @param {String} queueName - Nome da fila
   */
  async _persistQueue(queueName) {
    try {
      const queue = this.queues.get(queueName);
      if (!queue) return;
      
      const filePath = path.join(this.persistPath, `${queueName}.json`);
      
      // Filtrar tarefas completas antigas para evitar crescimento infinito
      const tasksToSave = queue.tasks.filter(task => {
        // Manter todas as tarefas não completadas
        if (task.status !== 'completed') return true;
        
        // Manter tarefas completadas recentes (últimas 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return task.completedAt > oneDayAgo;
      });
      
      const data = {
        name: queue.name,
        options: queue.options,
        stats: queue.stats,
        tasks: tasksToSave,
        updatedAt: new Date()
      };
      
      await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.error(`❌ Erro ao persistir fila "${queueName}":`, error.message);
    }
  }
  
  /**
   * Carrega filas persistidas do disco
   * @private
   */
  async _loadPersistedQueues() {
    try {
      const files = await fs.readdir(this.persistPath);
      
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        try {
          const filePath = path.join(this.persistPath, file);
          const data = JSON.parse(await fs.readFile(filePath, 'utf8'));
          
          const queueName = data.name;
          
          // Criar fila
          const queue = this.createQueue(queueName, data.options);
          
          // Restaurar estatísticas
          queue.stats = data.stats;
          
          // Restaurar tarefas
          queue.tasks = data.tasks.map(task => ({
            ...task,
            createdAt: new Date(task.createdAt),
            updatedAt: new Date(task.updatedAt),
            startedAt: task.startedAt ? new Date(task.startedAt) : undefined,
            completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
            failedAt: task.failedAt ? new Date(task.failedAt) : undefined,
            nextAttempt: task.nextAttempt ? new Date(task.nextAttempt) : undefined
          }));
          
          console.log(`✅ Fila "${queueName}" carregada do disco com ${queue.tasks.length} tarefas`);
          
          // Processar tarefas pendentes
          if (!queue.paused) {
            this._processQueue(queueName);
          }
        } catch (error) {
          console.error(`❌ Erro ao carregar fila do arquivo "${file}":`, error.message);
        }
      }
    } catch (error) {
      console.error('❌ Erro ao carregar filas persistidas:', error.message);
    }
  }
}

module.exports = new QueueService();
