/**
 * NFC Manager - High Performance Worker Pool for Python NFC Operations
 * Manages Python worker processes with connection pooling for optimal performance
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

class NFCWorker extends EventEmitter {
  constructor(scriptPath) {
    super();
    this.scriptPath = scriptPath;
    this.process = null;
    this.ready = false;
    this.busy = false;
    this.currentCallback = null;
    this.buffer = '';
  }

  /**
   * Start the Python worker process
   */
  start() {
    return new Promise((resolve, reject) => {
      this.process = spawn('python3', [this.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Handle stdout data
      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');

        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          try {
            const response = JSON.parse(lines[i]);
            this.handleResponse(response);
          } catch (e) {
            console.error('Failed to parse response:', lines[i], e);
          }
        }

        // Keep the incomplete line in buffer
        this.buffer = lines[lines.length - 1];
      });

      // Handle stderr
      this.process.stderr.on('data', (data) => {
        console.error(`Worker stderr: ${data}`);
      });

      // Handle process exit
      this.process.on('exit', (code) => {
        console.log(`Worker process exited with code ${code}`);
        this.ready = false;
        this.emit('exit', code);
      });

      // Handle process error
      this.process.on('error', (error) => {
        console.error('Worker process error:', error);
        reject(error);
      });

      // Wait for ready status
      const readyTimeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout'));
      }, 10000);

      this.once('ready', () => {
        clearTimeout(readyTimeout);
        resolve();
      });
    });
  }

  /**
   * Handle response from Python worker
   */
  handleResponse(response) {
    // Handle status updates
    if (response.status) {
      this.emit('status', response);

      if (response.status === 'ready') {
        this.ready = true;
        this.emit('ready');
      }
      return;
    }

    // Handle command responses
    if (this.currentCallback) {
      const callback = this.currentCallback;
      this.currentCallback = null;
      this.busy = false;

      if (response.success) {
        callback(null, response.data);
      } else {
        callback(new Error(response.error || 'Unknown error'));
      }
    }
  }

  /**
   * Send command to Python worker
   */
  sendCommand(action, params = {}) {
    return new Promise((resolve, reject) => {
      if (!this.ready) {
        return reject(new Error('Worker not ready'));
      }

      if (this.busy) {
        return reject(new Error('Worker is busy'));
      }

      this.busy = true;
      this.currentCallback = (error, data) => {
        if (error) {
          reject(error);
        } else {
          resolve(data);
        }
      };

      const command = JSON.stringify({ action, params }) + '\n';
      this.process.stdin.write(command);
    });
  }

  /**
   * Check if worker is available
   */
  isAvailable() {
    return this.ready && !this.busy;
  }

  /**
   * Terminate the worker process
   */
  terminate() {
    if (this.process) {
      this.process.kill();
    }
  }
}

class NFCManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.poolSize = options.poolSize || 1; // Usually 1 for NFC (single reader)
    this.scriptPath = options.scriptPath || path.join(__dirname, '../nfc_worker.py');
    this.workers = [];
    this.queue = [];
    this.initialized = false;
  }

  /**
   * Initialize the worker pool
   */
  async init() {
    console.log(`Initializing NFC Manager with ${this.poolSize} worker(s)...`);

    const workerPromises = [];
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new NFCWorker(this.scriptPath);

      worker.on('status', (status) => {
        this.emit('status', { workerId: i, ...status });
      });

      worker.on('exit', () => {
        // Remove dead worker from pool
        const index = this.workers.indexOf(worker);
        if (index > -1) {
          this.workers.splice(index, 1);
        }
      });

      this.workers.push(worker);
      workerPromises.push(worker.start());
    }

    await Promise.all(workerPromises);
    this.initialized = true;
    console.log('NFC Manager initialized successfully');
  }

  /**
   * Get an available worker from the pool
   */
  getAvailableWorker() {
    return this.workers.find(worker => worker.isAvailable());
  }

  /**
   * Execute a command on an available worker
   */
  async execute(action, params = {}) {
    if (!this.initialized) {
      throw new Error('NFC Manager not initialized. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      const tryExecute = () => {
        const worker = this.getAvailableWorker();

        if (worker) {
          worker.sendCommand(action, params)
            .then(resolve)
            .catch(reject);
        } else {
          // Queue the request
          this.queue.push({ action, params, resolve, reject });
        }
      };

      tryExecute();

      // Process queue when workers become available
      this.workers.forEach(worker => {
        worker.on('status', () => {
          if (worker.isAvailable() && this.queue.length > 0) {
            const queued = this.queue.shift();
            worker.sendCommand(queued.action, queued.params)
              .then(queued.resolve)
              .catch(queued.reject);
          }
        });
      });
    });
  }

  /**
   * Write JSON data to NFC card
   */
  async write(data, options = {}) {
    return this.execute('write', {
      data,
      start_block: options.startBlock || 4,
      debug: options.debug || false
    });
  }

  /**
   * Read JSON data from NFC card
   */
  async read(options = {}) {
    return this.execute('read', {
      start_block: options.startBlock || 4,
      num_blocks: options.numBlocks || 6,
      debug: options.debug || false
    });
  }

  /**
   * Format NFC card
   */
  async format(options = {}) {
    return this.execute('format', {
      start_block: options.startBlock || 4,
      num_blocks: options.numBlocks || 16
    });
  }

  /**
   * Shutdown the manager and all workers
   */
  shutdown() {
    console.log('Shutting down NFC Manager...');
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.initialized = false;
  }
}

module.exports = NFCManager;
