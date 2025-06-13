
/**
 * Enhanced Async Manager for optimized asynchronous operations
 */

const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class OptimizedAsyncManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.activeOperations = new Map();
    this.completedOperations = new Set();
    this.metrics = {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageExecutionTime: 0
    };
    this.executionTimes = [];
    this.maxConcurrency = options.maxConcurrency || 10;
    this.currentConcurrency = 0;
    this.queue = [];
  }

  async executeWithRetry(operationId, operation, options = {}) {
    const {
      timeout = 10000,
      retries = 3,
      backoffMultiplier = 2,
      priority = 0
    } = options;

    if (this.activeOperations.has(operationId)) {
      throw new Error(`Operation ${operationId} is already running`);
    }

    // Queue management for concurrency control
    if (this.currentConcurrency >= this.maxConcurrency) {
      await this.queueOperation(operationId, operation, options);
      return;
    }

    this.currentConcurrency++;
    this.metrics.totalOperations++;
    const startTime = Date.now();

    this.activeOperations.set(operationId, {
      startTime,
      timeout,
      retries: retries + 1
    });

    this.emit('operationStarted', { operationId, options });

    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = await Promise.race([
            operation(),
            this.createTimeoutPromise(timeout, operationId)
          ]);

          this.recordSuccess(operationId, startTime);
          return result;

        } catch (error) {
          if (attempt === retries) {
            this.recordFailure(operationId, startTime, error);
            throw error;
          }

          const backoffTime = Math.min(
            1000 * Math.pow(backoffMultiplier, attempt),
            30000 // Max 30 seconds
          );

          console.warn(`🔄 Retry ${attempt + 1}/${retries + 1} for ${operationId} after ${backoffTime}ms`);
          await this.delay(backoffTime);
        }
      }
    } finally {
      this.activeOperations.delete(operationId);
      this.currentConcurrency--;
      this.processQueue();
    }
  }

  async queueOperation(operationId, operation, options) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        operationId,
        operation,
        options,
        resolve,
        reject,
        priority: options.priority || 0,
        timestamp: Date.now()
      });

      // Sort by priority (higher first) then by timestamp
      this.queue.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority;
        }
        return a.timestamp - b.timestamp;
      });
    });
  }

  async processQueue() {
    if (this.queue.length === 0 || this.currentConcurrency >= this.maxConcurrency) {
      return;
    }

    const { operationId, operation, options, resolve, reject } = this.queue.shift();

    try {
      const result = await this.executeWithRetry(operationId, operation, options);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }

  createTimeoutPromise(timeout, operationId) {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Operation ${operationId} timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  recordSuccess(operationId, startTime) {
    const executionTime = Date.now() - startTime;
    this.executionTimes.push(executionTime);
    
    // Maintain circular buffer for memory efficiency
    if (this.executionTimes.length > 1000) {
      this.executionTimes.shift();
    }

    this.metrics.successfulOperations++;
    this.updateAverageExecutionTime();
    this.completedOperations.add(operationId);

    this.emit('operationCompleted', { operationId, executionTime, success: true });
  }

  recordFailure(operationId, startTime, error) {
    const executionTime = Date.now() - startTime;
    this.metrics.failedOperations++;

    this.emit('operationCompleted', { 
      operationId, 
      executionTime, 
      success: false, 
      error: error.message 
    });
  }

  updateAverageExecutionTime() {
    if (this.executionTimes.length > 0) {
      const sum = this.executionTimes.reduce((a, b) => a + b, 0);
      this.metrics.averageExecutionTime = Math.round(sum / this.executionTimes.length);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getActiveOperations() {
    return Array.from(this.activeOperations.keys());
  }

  getQueuedOperations() {
    return this.queue.map(item => ({
      operationId: item.operationId,
      priority: item.priority,
      queuedAt: new Date(item.timestamp)
    }));
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeOperations: this.activeOperations.size,
      queuedOperations: this.queue.length,
      concurrencyUtilization: (this.currentConcurrency / this.maxConcurrency * 100).toFixed(1) + '%',
      successRate: this.metrics.totalOperations > 0 ? 
        (this.metrics.successfulOperations / this.metrics.totalOperations * 100).toFixed(1) + '%' : '0%'
    };
  }

  isOperationActive(operationId) {
    return this.activeOperations.has(operationId);
  }

  cancelOperation(operationId) {
    if (this.activeOperations.has(operationId)) {
      this.activeOperations.delete(operationId);
      this.currentConcurrency--;
      this.emit('operationCancelled', { operationId });
      return true;
    }

    // Remove from queue if present
    const queueIndex = this.queue.findIndex(item => item.operationId === operationId);
    if (queueIndex !== -1) {
      this.queue.splice(queueIndex, 1);
      this.emit('operationCancelled', { operationId });
      return true;
    }

    return false;
  }

  clearCompleted() {
    this.completedOperations.clear();
    this.executionTimes = [];
  }

  setConcurrencyLimit(limit) {
    this.maxConcurrency = Math.max(1, limit);
    this.processQueue(); // Process any queued operations
  }
}

class EnhancedWorkQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.concurrency = options.concurrency || 5;
    this.retries = options.retries || 2;
    this.onError = options.onError || console.error;
    this.queue = [];
    this.running = 0;
    this.processed = 0;
    this.failed = 0;
    this.paused = false;
  }

  async add(task, options = {}) {
    return new Promise((resolve, reject) => {
      this.queue.push({ 
        task, 
        resolve, 
        reject, 
        priority: options.priority || 0,
        retries: options.retries ?? this.retries,
        timestamp: Date.now()
      });
      
      this.sortQueue();
      this.process();
    });
  }

  sortQueue() {
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.timestamp - b.timestamp;
    });
  }

  async process() {
    if (this.paused || this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { task, resolve, reject, retries } = this.queue.shift();

    try {
      const result = await this.executeWithRetry(task, retries);
      this.processed++;
      resolve(result);
      this.emit('taskCompleted', { success: true, processed: this.processed });
    } catch (error) {
      this.failed++;
      this.onError(error);
      reject(error);
      this.emit('taskCompleted', { success: false, error: error.message });
    } finally {
      this.running--;
      this.process();
    }
  }

  async executeWithRetry(task, retries) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await task();
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  pause() {
    this.paused = true;
    this.emit('queuePaused');
  }

  resume() {
    this.paused = false;
    this.emit('queueResumed');
    this.process();
  }

  clear() {
    this.queue = [];
    this.emit('queueCleared');
  }

  getStats() {
    return {
      running: this.running,
      queued: this.queue.length,
      processed: this.processed,
      failed: this.failed,
      paused: this.paused,
      successRate: this.processed > 0 ? 
        ((this.processed / (this.processed + this.failed)) * 100).toFixed(1) + '%' : '0%'
    };
  }
}

class OptimizedFileManager {
  constructor(options = {}) {
    this.asyncManager = new OptimizedAsyncManager(options);
    this.workQueue = new EnhancedWorkQueue({
      concurrency: options.fileConcurrency || 3,
      retries: options.fileRetries || 2,
      onError: (error) => console.error('File operation error:', error)
    });
    
    // Setup event handlers
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.asyncManager.on('operationCompleted', (event) => {
      if (!event.success) {
        console.warn(`File operation failed: ${event.operationId} - ${event.error}`);
      }
    });

    this.workQueue.on('taskCompleted', (event) => {
      if (event.success) {
        console.log(`✅ File task completed. Total processed: ${event.processed}`);
      }
    });
  }

  async readFile(filePath, options = {}) {
    const operationId = `read_${filePath}_${Date.now()}`;

    return this.asyncManager.executeWithRetry(
      operationId,
      async () => {
        try {
          const content = await fs.readFile(filePath, options.encoding || 'utf8');
          return content;
        } catch (error) {
          if (error.code === 'ENOENT') {
            throw new Error(`File not found: ${filePath}`);
          }
          throw error;
        }
      },
      {
        timeout: options.timeout || 10000,
        retries: options.retries || 2,
        priority: options.priority || 0
      }
    );
  }

  async writeFile(filePath, content, options = {}) {
    const operationId = `write_${filePath}_${Date.now()}`;

    // Ensure directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true }).catch(() => {});

    return this.asyncManager.executeWithRetry(
      operationId,
      async () => {
        try {
          await fs.writeFile(filePath, content, options.encoding || 'utf8');
          return { success: true, path: filePath, size: content.length };
        } catch (error) {
          throw new Error(`Failed to write file ${filePath}: ${error.message}`);
        }
      },
      {
        timeout: options.timeout || 15000,
        retries: options.retries || 2,
        priority: options.priority || 0
      }
    );
  }

  async readDirectory(dirPath, options = {}) {
    const operationId = `readdir_${dirPath}_${Date.now()}`;

    return this.asyncManager.executeWithRetry(
      operationId,
      async () => {
        try {
          const items = await fs.readdir(dirPath, { withFileTypes: true });
          
          if (options.recursive) {
            const results = [];
            for (const item of items) {
              const itemPath = path.join(dirPath, item.name);
              if (item.isDirectory()) {
                const subItems = await this.readDirectory(itemPath, options);
                results.push(...subItems.map(sub => path.join(item.name, sub)));
              } else {
                results.push(item.name);
              }
            }
            return results;
          }
          
          return items.map(item => item.name);
        } catch (error) {
          throw new Error(`Failed to read directory ${dirPath}: ${error.message}`);
        }
      },
      {
        timeout: options.timeout || 10000,
        retries: options.retries || 1
      }
    );
  }

  async copyFile(source, destination, options = {}) {
    const operationId = `copy_${source}_to_${destination}_${Date.now()}`;

    return this.workQueue.add(async () => {
      const dir = path.dirname(destination);
      await fs.mkdir(dir, { recursive: true }).catch(() => {});
      
      await fs.copyFile(source, destination);
      return { success: true, source, destination };
    }, options);
  }

  async batchOperation(operations, options = {}) {
    const batchId = `batch_${Date.now()}`;
    console.log(`🔄 Starting batch operation: ${batchId} (${operations.length} operations)`);

    const results = [];
    const errors = [];

    for (const operation of operations) {
      try {
        const result = await operation();
        results.push(result);
      } catch (error) {
        errors.push(error);
        if (!options.continueOnError) {
          throw new Error(`Batch operation failed: ${error.message}`);
        }
      }
    }

    console.log(`✅ Batch operation completed: ${results.length} successful, ${errors.length} failed`);
    
    return {
      success: errors.length === 0,
      results,
      errors,
      total: operations.length
    };
  }

  getMetrics() {
    return {
      asyncManager: this.asyncManager.getMetrics(),
      workQueue: this.workQueue.getStats()
    };
  }

  cleanup() {
    this.asyncManager.clearCompleted();
    this.workQueue.clear();
  }
}

module.exports = {
  AsyncManager: OptimizedAsyncManager,
  WorkQueue: EnhancedWorkQueue,
  FileManager: OptimizedFileManager
};
