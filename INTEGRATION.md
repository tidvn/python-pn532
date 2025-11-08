# Node.js - Python NFC Integration Guide

Tài liệu chi tiết về cách Python và Node.js giao tiếp với nhau trong dự án này.

## Kiến trúc tổng quan

```
┌─────────────────────────────────────────────────────────┐
│                    Node.js Layer                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │              Express.js API Server                 │  │
│  │         (REST endpoints for clients)               │  │
│  └────────────────────┬──────────────────────────────┘  │
│                       │                                  │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │             NFC Manager                            │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │  Single Python Worker                        │ │  │
│  │  │  Queue: [Task1, Task2, Task3...]             │ │  │
│  │  │  (Sequential execution)                      │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  └────────────────────┬──────────────────────────────┘  │
└─────────────────────────┬──────────────────────────────┘
                          │ stdin/stdout (JSON)
                          │ (Inter-Process Communication)
┌─────────────────────────▼──────────────────────────────┐
│                   Python Layer                          │
│  ┌───────────────────────────────────────────────────┐ │
│  │            nfc_worker.py Process                   │ │
│  │  • Khởi tạo PN532 một lần                          │ │
│  │  • Lắng nghe commands từ stdin                     │ │
│  │  • Xử lý: read / write / format                    │ │
│  │  • Trả kết quả qua stdout                          │ │
│  └────────────────────┬──────────────────────────────┘ │
└─────────────────────────┬──────────────────────────────┘
                          │
┌─────────────────────────▼──────────────────────────────┐
│                  Hardware Layer                         │
│              PN532 NFC Reader Module                    │
│                    MiFare Cards                         │
└─────────────────────────────────────────────────────────┘
```

## Communication Protocol

### 1. Message Format

**Từ Node.js → Python (stdin):**
```json
{
  "action": "write|read|format|exit",
  "params": {
    "data": {...},
    "start_block": 4,
    "num_blocks": 6,
    "debug": false
  }
}
```

**Từ Python → Node.js (stdout):**

Status updates:
```json
{
  "status": "initializing|ready|waiting",
  "message": "Human readable message"
}
```

Response:
```json
{
  "success": true|false,
  "data": {...},
  "error": "Error message if failed"
}
```

### 2. Worker Lifecycle

```
┌────────────────────────────────────────────────────────┐
│                   Worker Lifecycle                      │
└────────────────────────────────────────────────────────┘

1. START
   ├─→ Node.js spawns Python process
   └─→ Python initializes PN532

2. INITIALIZE
   ├─→ Python sends: {"status": "initializing", ...}
   ├─→ PN532 initialization
   └─→ Python sends: {"status": "ready", ...}

3. READY (Worker available)
   └─→ Worker marked as available in pool

4. REQUEST
   ├─→ Node.js sends command via stdin
   ├─→ Worker marked as BUSY
   └─→ Python sends: {"status": "waiting", ...}

5. PROCESSING
   ├─→ User places NFC card
   ├─→ Python executes operation
   └─→ Python sends result: {"success": true, ...}

6. COMPLETE
   ├─→ Node.js receives result
   ├─→ Worker marked as AVAILABLE
   └─→ Process next queued request (if any)

7. SHUTDOWN (optional)
   ├─→ Node.js sends: {"action": "exit"}
   └─→ Python process terminates
```

## Sequential Queue Management

### Single Worker Design

```javascript
const nfcManager = new NFCManager();
```

**Tại sao chỉ 1 worker:**
- Chỉ có 1 module PN532
- Không thể đọc/ghi 2 thẻ cùng lúc
- Operations phải chạy tuần tự để tránh conflict

### Queue System

Khi worker đang busy:
1. Request mới được thêm vào queue
2. Khi operation hiện tại hoàn thành, tự động lấy request tiếp theo từ queue
3. FIFO (First In First Out) ordering
4. Node.js code vẫn async/await nhưng Python operations chạy tuần tự

```javascript
Processing: Write(data1)
Queue: [Read(), Write(data2)]
         ↓ (Write(data1) completes)
Processing: Read()
Queue: [Write(data2)]
         ↓ (Read() completes)
Processing: Write(data2)
Queue: []
```

## Performance Optimizations

### 1. Process Reuse
- Worker process không restart sau mỗi operation
- PN532 chỉ initialize một lần
- Tiết kiệm ~2-3 giây mỗi request

**Benchmark:**
```
Traditional (spawn mỗi lần): ~5s per operation
Worker Pool: ~2s per operation (sau init)
Improvement: 60% faster
```

### 2. Process Reuse
```javascript
// Bad: Khởi tạo lại mỗi lần
spawn('python3', ['write.py'])  // 5s (spawn + init PN532 + write)
spawn('python3', ['read.py'])   // 5s (spawn + init PN532 + read)
Total: 10s

// Good: Reuse single worker
nfcManager.write(data)          // 2s (write only, PN532 already init)
nfcManager.read()               // 2s (read only, PN532 already init)
Total: 4s
```

### 3. Asynchronous Operations
- Node.js không block khi đợi Python
- Có thể xử lý multiple HTTP requests (queued)
- Event-driven architecture

## Error Handling

### Timeout Handling
```javascript
// Worker initialization timeout: 10s
const readyTimeout = setTimeout(() => {
  reject(new Error('Worker initialization timeout'));
}, 10000);
```

### Process Crash Handling
```javascript
worker.on('exit', (code) => {
  // Remove dead worker from pool
  // Log error
  // Optionally: respawn worker
});
```

### JSON Parse Errors
```javascript
try {
  const response = JSON.parse(line);
} catch (e) {
  console.error('Failed to parse response:', line);
  // Continue processing, don't crash
}
```

## Security Considerations

### 1. Input Validation
```javascript
// Server side
if (!data) {
  return res.status(400).json({
    error: 'Missing data field'
  });
}
```

### 2. Process Isolation
- Python worker chạy trong separate process
- Crash ở worker không ảnh hưởng Node.js server
- Memory leak ở Python không ảnh hưởng Node.js

### 3. Resource Limits
```javascript
// Limit pool size
poolSize: 1  // Prevent resource exhaustion

// Queue size limit (optional)
if (this.queue.length > 100) {
  throw new Error('Queue full');
}
```

## Troubleshooting

### Issue: Worker không khởi động
**Nguyên nhân:**
- Python3 không cài đặt
- Dependencies thiếu
- Sai đường dẫn script

**Giải pháp:**
```bash
# Check Python
python3 --version

# Check dependencies
pip3 list | grep adafruit

# Check script path
ls -la nfc_worker.py
```

### Issue: Worker timeout
**Nguyên nhân:**
- PN532 hardware không kết nối
- Permission denied (SPI/GPIO)

**Giải pháp:**
```bash
# Check hardware
python3 example/simpletest.py

# Fix permissions
sudo usermod -a -G spi,gpio $USER
sudo reboot
```

### Issue: Response không nhận được
**Nguyên nhân:**
- Buffer không flush
- JSON parse error

**Giải pháp Python:**
```python
print(json.dumps(response), flush=True)
sys.stdout.flush()  # Ensure immediate send
```

## Best Practices

### 1. Graceful Shutdown
```javascript
process.on('SIGINT', () => {
  nfcManager.shutdown();  // Terminate all workers
  process.exit(0);
});
```

### 2. Status Logging
```javascript
nfcManager.on('status', (status) => {
  console.log(`[${new Date().toISOString()}] ${status.message}`);
});
```

### 3. Error Propagation
```javascript
try {
  const result = await nfcManager.write(data);
} catch (error) {
  // Log error
  console.error('Write failed:', error);

  // Return user-friendly message
  res.status(500).json({
    error: 'Failed to write to NFC card'
  });
}
```

## Testing

### Unit Testing Worker Pool
```javascript
const nfcManager = new NFCManager();
await nfcManager.init();

// Test write
const writeResult = await nfcManager.write({test: true});
assert(writeResult.success);

// Test read
const readResult = await nfcManager.read();
assert.equal(readResult.test, true);
```

### Load Testing
```bash
# Apache Bench
ab -n 100 -c 10 -p data.json -T application/json \
   http://localhost:3000/nfc/write

# Expected: Requests queued properly, no crashes
```

### Integration Testing
```bash
# Run test script
cd nodejs
./test-api.sh
```

## Monitoring

### Metrics to Track
- Worker pool utilization
- Queue length
- Average response time
- Error rate

```javascript
// Simple monitoring
let stats = {
  requests: 0,
  errors: 0,
  avgResponseTime: 0
};

// Update on each request
stats.requests++;

// Log periodically
setInterval(() => {
  console.log('Stats:', stats);
}, 60000);
```

## Scaling Considerations

### Multiple NFC Readers
Nếu cần xử lý nhiều PN532 readers cùng lúc:

```javascript
// Multiple readers setup (mỗi reader = 1 manager)
const reader1 = new NFCManager({
  scriptPath: './worker1.py'  // PN532 Reader 1
});

const reader2 = new NFCManager({
  scriptPath: './worker2.py'  // PN532 Reader 2
});

await Promise.all([
  reader1.init(),
  reader2.init()
]);

// Có thể xử lý parallel trên 2 readers khác nhau
await Promise.all([
  reader1.write(data1),  // Reader 1
  reader2.write(data2)   // Reader 2
]);
```

### Load Balancing
```javascript
// Round-robin giữa multiple readers
const readers = [reader1, reader2, reader3];
let currentIndex = 0;

function getNextReader() {
  const reader = readers[currentIndex];
  currentIndex = (currentIndex + 1) % readers.length;
  return reader;
}

// Distribute load
await getNextReader().write(data1);
await getNextReader().write(data2);
```

## Summary

- **Architecture:** Node.js ↔ stdin/stdout ↔ Python (single worker)
- **Sequential Execution:** Operations chạy tuần tự (vì 1 PN532)
- **Performance:** ~60% faster với process reuse
- **Queue System:** Tự động queue + FIFO processing
- **Reliability:** Error handling + graceful shutdown
- **Security:** Input validation + process isolation

Happy coding! 🚀
