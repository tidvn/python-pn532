/**
 * Example: Using NFC Manager directly in Node.js
 */

const NFCManager = require('./nfc-manager');

async function main() {
  // Create NFC Manager instance
  const nfcManager = new NFCManager({
    poolSize: 1 // 1 worker for single NFC reader
  });

  // Listen to status events
  nfcManager.on('status', (status) => {
    console.log('📡 Status:', status.message);
  });

  try {
    // Initialize the manager
    await nfcManager.init();

    console.log('\n=== NFC Manager Ready ===\n');

    // Example 1: Write data to NFC card
    console.log('--- Example 1: Write to NFC ---');
    console.log('Please place your NFC card on the reader...\n');

    const dataToWrite = {
      name: 'Tiến Dũng',
      id: 12345,
      email: 'tien.dung@example.com',
      timestamp: new Date().toISOString()
    };

    try {
      const writeResult = await nfcManager.write(dataToWrite);
      console.log('✅ Write Success:', writeResult);
    } catch (error) {
      console.error('❌ Write Error:', error.message);
    }

    // Wait a moment
    console.log('\n--- Example 2: Read from NFC ---');
    console.log('Remove and place the card again to read...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Example 2: Read data from NFC card
    try {
      const readData = await nfcManager.read();
      console.log('✅ Read Success:', readData);
    } catch (error) {
      console.error('❌ Read Error:', error.message);
    }

    // Example 3: Format NFC card (optional, commented out)
    // console.log('\n--- Example 3: Format NFC ---');
    // try {
    //   const formatResult = await nfcManager.format();
    //   console.log('✅ Format Success:', formatResult);
    // } catch (error) {
    //   console.error('❌ Format Error:', error.message);
    // }

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    // Cleanup
    console.log('\nShutting down...');
    nfcManager.shutdown();
  }
}

// Run the example
main().catch(console.error);
