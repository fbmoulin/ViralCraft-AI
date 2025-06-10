/**
 * Async Manager for handling asynchronous operations with retry logic
 */

const fs = require('fs').promises;
const path = require( 'path' );

class AsyncManager {
  constructor() {
    this.activeOperations = new Map();
    this.completedOperations = new Set();
  }

  async executeWithRetry(operationId, operation, options = {}) {
    const { timeout = 5000, retries = 1 } = options;

    if (this.activeOperations.has(operationId)) {
      throw new Error(`Operation ${operationId} is already running`);
    }

    this.activeOperations.set(operationId, Date.now());

    try {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const result = await Promise.race([
            operation(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Operation timeout')), timeout)
            )
          ]);

          this.activeOperations.delete(operationId);
          this.completedOperations.add(operationId);
          return result;
        } catch (error) {
          if (attempt === retries) {
            throw error;
          }
          console.warn(`Attempt ${attempt + 1} failed for ${operationId}, retrying...`);
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    } catch (error) {
      this.activeOperations.delete(operationId);
      throw error;
    }
  }

  getActiveOperations() {
    return Array.from(this.activeOperations.keys());
  }

  isOperationActive(operationId) {
    return this.activeOperations.has(operationId);
  }
}

class WorkQueue {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 5;
    this.retries = options.retries || 0;
    this.onError = options.onError || console.error;
    this.queue = [];
    this.running = 0;
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { task, resolve, reject } = this.queue.shift();

    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      this.onError(error);
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

class FileManager {
  constructor() {
    this.asyncManager = new AsyncManager();
    this.workQueue = new WorkQueue({
      concurrency: 3,
      retries: 1,
      onError: (error) => console.error('File operation error:', error)
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
          console.error(`Error reading file ${filePath}:`, error.message);
          throw error;
        }
      },
      {
        timeout: options.timeout || 5000,
        retries: options.retries || 1
      }
    );
  }

  async writeFile(filePath, content, options = {}) {
    const operationId = `write_${filePath}_${Date.now()}`;

    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true }).catch(() => {});

    return this.asyncManager.executeWithRetry(
      operationId,
      async () => {
        try {
          await fs.writeFile(filePath, content, options.encoding || 'utf8');
          return true;
        } catch (error) {
          console.error(`Error writing file ${filePath}:`, error.message);
          throw error;
        }
      },
      {
        timeout: options.timeout || 5000,
        retries: options.retries || 1
      }
    );
  }
}

module.exports = {
  AsyncManager,
  WorkQueue,
  FileManager
};