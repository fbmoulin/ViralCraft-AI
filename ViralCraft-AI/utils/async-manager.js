// Otimização de tratamento assíncrono e promises
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

// Promisificar funções do fs para uso com async/await
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Classe para gerenciamento de operações assíncronas
class AsyncManager {
  constructor() {
    this.pendingOperations = new Map();
    this.completedOperations = new Map();
    this.failedOperations = new Map();
    this.operationTimeouts = new Map();
    
    // Configurações
    this.defaultTimeout = 30000; // 30 segundos
    this.retryCount = 2;
    this.retryDelay = 1000; // 1 segundo
    
    // Métricas
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      retriedOperations: 0,
      averageResponseTime: 0
    };
  }
  
  // Executar operação assíncrona com retry e timeout
  async executeWithRetry(operationId, operation, options = {}) {
    const {
      timeout = this.defaultTimeout,
      retries = this.retryCount,
      retryDelay = this.retryDelay,
      critical = false
    } = options;
    
    this.metrics.totalOperations++;
    const startTime = Date.now();
    
    // Registrar operação pendente
    this.pendingOperations.set(operationId, {
      id: operationId,
      startTime,
      status: 'pending',
      retries: 0,
      critical
    });
    
    // Configurar timeout
    const timeoutPromise = new Promise((_, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operação ${operationId} excedeu o timeout de ${timeout}ms`));
      }, timeout);
      
      this.operationTimeouts.set(operationId, timeoutId);
    });
    
    // Função para executar com retry
    const executeWithRetries = async (retriesLeft) => {
      try {
        const result = await operation();
        
        // Limpar timeout
        clearTimeout(this.operationTimeouts.get(operationId));
        this.operationTimeouts.delete(operationId);
        
        // Registrar sucesso
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        this.pendingOperations.delete(operationId);
        this.completedOperations.set(operationId, {
          id: operationId,
          startTime,
          endTime,
          duration,
          status: 'completed',
          retries: options.retries - retriesLeft
        });
        
        // Atualizar métricas
        this.metrics.successfulOperations++;
        this.updateResponseTimeMetric(duration);
        
        return result;
      } catch (error) {
        // Se ainda temos retries, tentar novamente
        if (retriesLeft > 0) {
          this.metrics.retriedOperations++;
          
          // Atualizar status da operação
          const pendingOp = this.pendingOperations.get(operationId);
          if (pendingOp) {
            pendingOp.retries = options.retries - retriesLeft + 1;
            pendingOp.lastError = error.message;
            this.pendingOperations.set(operationId, pendingOp);
          }
          
          // Esperar antes de tentar novamente
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          
          // Tentar novamente
          return executeWithRetries(retriesLeft - 1);
        }
        
        // Sem mais retries, falhar
        clearTimeout(this.operationTimeouts.get(operationId));
        this.operationTimeouts.delete(operationId);
        
        // Registrar falha
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        this.pendingOperations.delete(operationId);
        this.failedOperations.set(operationId, {
          id: operationId,
          startTime,
          endTime,
          duration,
          status: 'failed',
          error: error.message,
          retries: options.retries - retriesLeft
        });
        
        // Atualizar métricas
        this.metrics.failedOperations++;
        
        throw error;
      }
    };
    
    // Executar com race entre operação e timeout
    return Promise.race([
      executeWithRetries(retries),
      timeoutPromise
    ]);
  }
  
  // Executar múltiplas operações em paralelo com limite
  async executeInBatches(operations, batchSize = 5, options = {}) {
    const results = [];
    const errors = [];
    
    // Dividir em lotes
    for (let i = 0; i < operations.length; i += batchSize) {
      const batch = operations.slice(i, i + batchSize);
      
      // Executar lote em paralelo
      const batchPromises = batch.map(op => 
        this.executeWithRetry(op.id, op.operation, options)
          .then(result => {
            results.push({ id: op.id, result });
            return result;
          })
          .catch(error => {
            errors.push({ id: op.id, error: error.message });
            if (options.failFast) {
              throw error;
            }
            return null;
          })
      );
      
      // Aguardar conclusão do lote atual
      await Promise.all(batchPromises);
      
      // Se failFast e tivemos erros, parar
      if (options.failFast && errors.length > 0) {
        break;
      }
    }
    
    return {
      results,
      errors,
      success: errors.length === 0,
      total: operations.length,
      completed: results.length,
      failed: errors.length
    };
  }
  
  // Executar operações em sequência
  async executeInSequence(operations, options = {}) {
    const results = [];
    const errors = [];
    
    for (const op of operations) {
      try {
        const result = await this.executeWithRetry(op.id, op.operation, options);
        results.push({ id: op.id, result });
      } catch (error) {
        errors.push({ id: op.id, error: error.message });
        if (options.failFast) {
          break;
        }
      }
    }
    
    return {
      results,
      errors,
      success: errors.length === 0,
      total: operations.length,
      completed: results.length,
      failed: errors.length
    };
  }
  
  // Cancelar operação pendente
  cancelOperation(operationId) {
    if (this.pendingOperations.has(operationId)) {
      // Limpar timeout
      clearTimeout(this.operationTimeouts.get(operationId));
      this.operationTimeouts.delete(operationId);
      
      // Registrar cancelamento
      const op = this.pendingOperations.get(operationId);
      const endTime = Date.now();
      const duration = endTime - op.startTime;
      
      this.pendingOperations.delete(operationId);
      this.failedOperations.set(operationId, {
        id: operationId,
        startTime: op.startTime,
        endTime,
        duration,
        status: 'cancelled',
        error: 'Operação cancelada manualmente',
        retries: op.retries
      });
      
      return true;
    }
    
    return false;
  }
  
  // Obter status de uma operação
  getOperationStatus(operationId) {
    if (this.pendingOperations.has(operationId)) {
      return { ...this.pendingOperations.get(operationId), status: 'pending' };
    }
    
    if (this.completedOperations.has(operationId)) {
      return { ...this.completedOperations.get(operationId), status: 'completed' };
    }
    
    if (this.failedOperations.has(operationId)) {
      return { ...this.failedOperations.get(operationId), status: 'failed' };
    }
    
    return { id: operationId, status: 'unknown' };
  }
  
  // Obter métricas
  getMetrics() {
    return {
      ...this.metrics,
      pendingOperations: this.pendingOperations.size,
      successRate: this.metrics.totalOperations > 0 
        ? (this.metrics.successfulOperations / this.metrics.totalOperations) * 100 
        : 0,
      retryRate: this.metrics.totalOperations > 0 
        ? (this.metrics.retriedOperations / this.metrics.totalOperations) * 100 
        : 0
    };
  }
  
  // Atualizar métrica de tempo de resposta
  updateResponseTimeMetric(newTime) {
    if (this.metrics.successfulOperations <= 1) {
      this.metrics.averageResponseTime = newTime;
    } else {
      // Média ponderada com mais peso para valores recentes
      this.metrics.averageResponseTime = 
        (this.metrics.averageResponseTime * 0.7) + (newTime * 0.3);
    }
  }
  
  // Limpar operações antigas
  cleanup(maxAge = 3600000) { // 1 hora em milissegundos
    const now = Date.now();
    
    // Limpar operações completadas antigas
    for (const [id, op] of this.completedOperations.entries()) {
      if (now - op.endTime > maxAge) {
        this.completedOperations.delete(id);
      }
    }
    
    // Limpar operações falhas antigas
    for (const [id, op] of this.failedOperations.entries()) {
      if (now - op.endTime > maxAge) {
        this.failedOperations.delete(id);
      }
    }
  }
}

// Classe para gerenciamento de filas de trabalho
class WorkQueue {
  constructor(options = {}) {
    this.queue = [];
    this.processing = false;
    this.concurrency = options.concurrency || 1;
    this.activeWorkers = 0;
    this.asyncManager = new AsyncManager();
    
    // Configurações
    this.autoStart = options.autoStart !== false;
    this.retries = options.retries || 2;
    this.retryDelay = options.retryDelay || 1000;
    this.timeout = options.timeout || 30000;
    
    // Eventos
    this.onComplete = options.onComplete || (() => {});
    this.onError = options.onError || (() => {});
    this.onEmpty = options.onEmpty || (() => {});
    this.onIdle = options.onIdle || (() => {});
    
    // Métricas
    this.metrics = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      averageJobTime: 0
    };
  }
  
  // Adicionar trabalho à fila
  add(job) {
    this.queue.push({
      id: `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      job,
      added: Date.now(),
      status: 'queued'
    });
    
    this.metrics.totalJobs++;
    
    if (this.autoStart && !this.processing) {
      this.start();
    }
    
    return this.queue.length;
  }
  
  // Adicionar múltiplos trabalhos à fila
  addBulk(jobs) {
    jobs.forEach(job => this.add(job));
    return this.queue.length;
  }
  
  // Iniciar processamento da fila
  start() {
    if (this.processing) return;
    
    this.processing = true;
    this.processNext();
  }
  
  // Pausar processamento
  pause() {
    this.processing = false;
  }
  
  // Limpar fila
  clear() {
    const count = this.queue.length;
    this.queue = [];
    return count;
  }
  
  // Processar próximo trabalho na fila
  async processNext() {
    if (!this.processing || this.activeWorkers >= this.concurrency) {
      return;
    }
    
    if (this.queue.length === 0) {
      if (this.activeWorkers === 0) {
        this.onEmpty();
        this.onIdle();
      }
      return;
    }
    
    // Obter próximo trabalho
    const item = this.queue.shift();
    this.activeWorkers++;
    
    try {
      // Executar trabalho com retry e timeout
      const result = await this.asyncManager.executeWithRetry(
        item.id,
        () => item.job(),
        {
          timeout: this.timeout,
          retries: this.retries,
          retryDelay: this.retryDelay
        }
      );
      
      // Registrar sucesso
      this.metrics.completedJobs++;
      this.onComplete(result, item);
    } catch (error) {
      // Registrar falha
      this.metrics.failedJobs++;
      this.onError(error, item);
    } finally {
      // Reduzir contador de workers ativos
      this.activeWorkers--;
      
      // Verificar se a fila está vazia
      if (this.queue.length === 0 && this.activeWorkers === 0) {
        this.onEmpty();
        this.onIdle();
      } else {
        // Processar próximo trabalho
        this.processNext();
      }
    }
    
    // Iniciar mais workers se possível
    if (this.queue.length > 0 && this.activeWorkers < this.concurrency) {
      this.processNext();
    }
  }
  
  // Obter status atual
  getStatus() {
    return {
      queued: this.queue.length,
      processing: this.activeWorkers,
      active: this.processing,
      metrics: {
        ...this.metrics,
        successRate: this.metrics.totalJobs > 0 
          ? (this.metrics.completedJobs / this.metrics.totalJobs) * 100 
          : 0
      }
    };
  }
}

// Classe para gerenciamento de operações de arquivo otimizadas
class FileManager {
  constructor() {
    this.asyncManager = new AsyncManager();
    this.workQueue = new WorkQueue({
      concurrency: 3,
      retries: 1,
      onError: (error) => console.error('Erro em operação de arquivo:', error)
    });
  }
  
  // Ler arquivo com cache e retry
  async readFile(filePath, options = {}) {
    const operationId = `read_${filePath}_${Date.now()}`;
    
    return this.asyncManager.executeWithRetry(
      operationId,
      async () => {
        try {
          const content = await readFile(filePath, options.encoding || 'utf8');
          return content;
        } catch (error) {
          console.error(`Erro ao ler arquivo ${filePath}:`, error.message);
          throw error;
        }
      },
      {
        timeout: options.timeout || 5000,
        retries: options.retries || 1
      }
    );
  }
  
  // Escrever arquivo com retry
  async writeFile(filePath, content, options = {}) {
    const operationId = `write_${filePath}_${Date.now()}`;
    
    // Garantir que o diretório exista
    const dir = path.dirname(filePath);
    await mkdir(dir, { recursive: true }).catch(() => {});
    
    return this.asyncManager.executeWithRetry(
      operationId,
      async () => {
        try {
          await writeFile(filePath, content, options.encoding || 'utf8');
          return true;
        } catch (error) {
          console.error(`Erro ao escrever arquivo ${filePath}:`, error.message);
          throw error;
        }
      },
      {
        timeout: options.timeout || 5000,
        retries: options.retries || 1
      }
    );
  }
  
  // Processar arquivos em lote
  async processBatch(files, processor, options = {}) {
    const operations = files.map(file => ({
      id: `process_${file}_${Date.now()}`,
      operation: () => processor(file)
    }));
    
    return this.asyncManager.executeInBatches(
      operations,
      options.batchSize || 5,
      {
        timeout: options.timeout || 30000,
        retries: options.retries || 1,
        failFast: options.failFast || false
      }
    );
  }
  
  // Adicionar operação à fila de trabalho
  queueOperation(operation, description) {
    return this.workQueue.add(operation);
  }
  
  // Obter métricas
  getMetrics() {
    return {
      async: this.asyncManager.getMetrics(),
      queue: this.workQueue.getStatus()
    };
  }
}

// Exportar classes e funções utilitárias
module.exports = {
  AsyncManager,
  WorkQueue,
  FileManager,
  fsPromises: {
    readFile,
    writeFile,
    mkdir,
    readdir,
    stat
  }
};
