/**
 * NFC Manager - Sequential Worker for Python NFC Operations
 * Manages a single Python worker process with sequential operation queue
 *
 * Since there's only one PN532 module, all operations must be sequential.
 * This manager ensures operations are queued and executed one at a time.
 */

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

class NFCManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.scriptPath = options.scriptPath || path.join(__dirname, '../nfc_worker.py');
    this.process = null;
    this.ready = false;
    this.busy = false;
    this.initialized = false;
    this.buffer = '';
    this.queue = [];
    this.currentCallback = null;
  }

  /**
   * Initialize the NFC Manager and start Python worker
   */
  async init() {
    console.log('Initializing NFC Manager...');

    return new Promise((resolve, reject) => {
      // Spawn Python worker process
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
        this.initialized = false;
        this.emit('exit', code);

        // Reject all queued requests
        while (this.queue.length > 0) {
          const queued = this.queue.shift();
          queued.reject(new Error('Worker process terminated'));
        }
      });

      // Handle process error
      this.process.on('error', (error) => {
        console.error('Worker process error:', error);
        reject(error);
      });

      // Wait for ready status
      const readyTimeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout (10s)'));
      }, 10000);

      this.once('ready', () => {
        clearTimeout(readyTimeout);
        this.initialized = true;
        console.log('NFC Manager initialized successfully');
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
        callback.resolve(response.data);
      } else {
        callback.reject(new Error(response.error || 'Unknown error'));
      }

      // Process next queued request
      this.processQueue();
    }
  }

  /**
   * Process the next request in queue
   */
  processQueue() {
    if (this.queue.length === 0 || this.busy || !this.ready) {
      return;
    }

    const queued = this.queue.shift();
    this.executeCommand(queued.action, queued.params, queued.resolve, queued.reject);
  }

  /**
   * Execute a command (internal method)
   */
  executeCommand(action, params, resolve, reject) {
    if (!this.ready) {
      return reject(new Error('Worker not ready'));
    }

    if (this.busy) {
      return reject(new Error('Worker is busy (this should not happen)'));
    }

    this.busy = true;
    this.currentCallback = { resolve, reject };

    const command = JSON.stringify({ action, params }) + '\n';
    this.process.stdin.write(command);
  }

  /**
   * Execute a command (public method with queuing)
   */
  async execute(action, params = {}) {
    if (!this.initialized) {
      throw new Error('NFC Manager not initialized. Call init() first.');
    }

    return new Promise((resolve, reject) => {
      // If worker is available, execute immediately
      if (this.ready && !this.busy) {
        this.executeCommand(action, params, resolve, reject);
      } else {
        // Otherwise, queue the request
        this.queue.push({ action, params, resolve, reject });
      }
    });
  }

  /**
   * Write JSON data to NFC card
   * Operations are queued and executed sequentially
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
   * Operations are queued and executed sequentially
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
   * Operations are queued and executed sequentially
   */
  async format(options = {}) {
    return this.execute('format', {
      start_block: options.startBlock || 4,
      num_blocks: options.numBlocks || 16
    });
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      ready: this.ready,
      busy: this.busy,
      queueLength: this.queue.length,
      initialized: this.initialized
    };
  }

  /**
   * Shutdown the manager and worker
   */
  shutdown() {
    console.log('Shutting down NFC Manager...');

    // Reject all queued requests
    while (this.queue.length > 0) {
      const queued = this.queue.shift();
      queued.reject(new Error('NFC Manager shutting down'));
    }

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.ready = false;
    this.busy = false;
    this.initialized = false;
  }
}

module.exports = NFCManager;
