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
│  │             NFC Manager (Pool)                     │  │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐    │  │
│  │  │ Worker 1   │ │ Worker 2   │ │ Worker N   │    │  │
│  │  └────────────┘ └────────────┘ └────────────┘    │  │
│  │           Queue: [Task1, Task2, Task3...]         │  │
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

## Worker Pool Management

### Pool Configuration

```javascript
const nfcManager = new NFCManager({
  poolSize: 1  // Thường là 1 cho single NFC reader
});
```

**Lý do poolSize = 1:**
- Mỗi PN532 reader cần 1 worker
- Không thể đọc 2 thẻ cùng lúc trên 1 reader
- Nếu có nhiều readers, tăng poolSize tương ứng

### Queue System

Khi tất cả workers đều busy:
1. Request được thêm vào queue
2. Khi worker hoàn thành task, tự động lấy task tiếp theo từ queue
3. FIFO (First In First Out) ordering

```javascript
Queue: [Write(data1), Read(), Write(data2)]
         ↓ (worker available)
Processing: Write(data1)
Queue: [Read(), Write(data2)]
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

### 2. Connection Pooling
```javascript
// Bad: Khởi tạo lại mỗi lần
spawn('python3', ['write.py'])  // 5s
spawn('python3', ['read.py'])   // 5s
Total: 10s

// Good: Reuse worker
worker.sendCommand('write')     // 2s
worker.sendCommand('read')      // 2s
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

### Horizontal Scaling
Nếu cần xử lý nhiều NFC readers:

```javascript
// Multiple readers setup
const reader1 = new NFCManager({
  poolSize: 1,
  scriptPath: './worker1.py'  // Reader 1
});

const reader2 = new NFCManager({
  poolSize: 1,
  scriptPath: './worker2.py'  // Reader 2
});
```

### Load Balancing
```javascript
// Round-robin between multiple managers
const managers = [manager1, manager2, manager3];
let currentIndex = 0;

function getNextManager() {
  const manager = managers[currentIndex];
  currentIndex = (currentIndex + 1) % managers.length;
  return manager;
}
```

## Summary

- **Architecture:** Node.js ↔ stdin/stdout ↔ Python
- **Performance:** ~60% faster với worker reuse
- **Scalability:** Queue system + process pooling
- **Reliability:** Error handling + graceful shutdown
- **Security:** Input validation + process isolation

Happy coding! 🚀
