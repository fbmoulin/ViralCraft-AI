/**
 * Queue Service for managing background tasks
 */
class QueueService {
  constructor() {
    this.queue = [];
    this.processing = false;
  }

  async addTask(task) {
    this.queue.push(task);
    if (!this.processing) {
      this.processQueue();
    }
  }

  async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      try {
        await task();
      } catch (error) {
        console.error('❌ Queue task error:', error);
      }
    }

    this.processing = false;
  }

  getQueueSize() {
    return this.queue.length;
  }
}

module.exports = new QueueService();