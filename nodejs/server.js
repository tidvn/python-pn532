/**
 * Express.js API Server for NFC Operations
 * Provides REST API endpoints for NFC read/write operations
 */

const express = require('express');
const NFCManager = require('./nfc-manager');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Initialize NFC Manager
const nfcManager = new NFCManager({
  poolSize: 1 // Single NFC reader
});

let serverReady = false;

// Status event logging
nfcManager.on('status', (status) => {
  console.log(`[${new Date().toISOString()}] 📡 ${status.message}`);
});

// Initialize NFC Manager
async function initializeServer() {
  try {
    console.log('Initializing NFC Manager...');
    await nfcManager.init();
    serverReady = true;
    console.log('✅ NFC Manager initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize NFC Manager:', error);
    process.exit(1);
  }
}

// Middleware to check if server is ready
function checkReady(req, res, next) {
  if (!serverReady) {
    return res.status(503).json({
      success: false,
      error: 'NFC Manager is initializing, please wait...'
    });
  }
  next();
}

// Routes

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    ready: serverReady,
    timestamp: new Date().toISOString()
  });
});

/**
 * POST /nfc/write
 * Write JSON data to NFC card
 *
 * Request body:
 * {
 *   "data": { ... },        // JSON data to write
 *   "startBlock": 4,        // Optional, default: 4
 *   "debug": false          // Optional, default: false
 * }
 */
app.post('/nfc/write', checkReady, async (req, res) => {
  try {
    const { data, startBlock, debug } = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Missing "data" field in request body'
      });
    }

    console.log(`\n[WRITE REQUEST] Data:`, data);

    const result = await nfcManager.write(data, { startBlock, debug });

    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('Write error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /nfc/read
 * Read JSON data from NFC card
 *
 * Request body:
 * {
 *   "startBlock": 4,        // Optional, default: 4
 *   "numBlocks": 6,         // Optional, default: 6
 *   "debug": false          // Optional, default: false
 * }
 */
app.post('/nfc/read', checkReady, async (req, res) => {
  try {
    const { startBlock, numBlocks, debug } = req.body;

    console.log(`\n[READ REQUEST]`);

    const result = await nfcManager.read({ startBlock, numBlocks, debug });

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Read error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /nfc/format
 * Format NFC card (clear data)
 *
 * Request body:
 * {
 *   "startBlock": 4,        // Optional, default: 4
 *   "numBlocks": 16         // Optional, default: 16
 * }
 */
app.post('/nfc/format', checkReady, async (req, res) => {
  try {
    const { startBlock, numBlocks } = req.body;

    console.log(`\n[FORMAT REQUEST]`);

    const result = await nfcManager.format({ startBlock, numBlocks });

    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error('Format error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /
 * API documentation
 */
app.get('/', (req, res) => {
  res.json({
    name: 'NFC API Server',
    version: '1.0.0',
    endpoints: {
      'GET /health': 'Health check',
      'POST /nfc/write': 'Write JSON data to NFC card',
      'POST /nfc/read': 'Read JSON data from NFC card',
      'POST /nfc/format': 'Format NFC card'
    },
    ready: serverReady
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  nfcManager.shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down gracefully...');
  nfcManager.shutdown();
  process.exit(0);
});

// Start server
async function startServer() {
  await initializeServer();

  app.listen(port, () => {
    console.log(`\n🚀 NFC API Server running on port ${port}`);
    console.log(`   Health: http://localhost:${port}/health`);
    console.log(`   Docs: http://localhost:${port}/\n`);
  });
}

startServer().catch(console.error);
