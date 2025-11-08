# NFC Node.js Worker Manager

Giải pháp hiệu suất cao để giao tiếp giữa Node.js và Python cho thao tác NFC, sử dụng single worker process với sequential queue.

## Kiến trúc

```
┌─────────────────────────────────────────┐
│         Node.js Application             │
│  ┌───────────────────────────────────┐  │
│  │       NFC Manager                 │  │
│  │  ┌─────────────────────────────┐ │  │
│  │  │  Single Python Worker       │ │  │
│  │  │  Queue: [Op1, Op2, Op3...]  │ │  │
│  │  └─────────────────────────────┘ │  │
│  └───────────────────────────────────┘  │
└──────────────┬──────────────────────────┘
               │ stdin/stdout (JSON)
               ▼
┌─────────────────────────────────────────┐
│      Python NFC Worker Process          │
│  ┌───────────────────────────────────┐  │
│  │      PN532 NFC Operations         │  │
│  │  • Read  • Write  • Format        │  │
│  │  (Sequential execution)           │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Tính năng

- ✨ **High Performance**: Single worker với process reuse
- 🔄 **Sequential Operations**: Đảm bảo operations chạy tuần tự (vì chỉ có 1 PN532)
- 📊 **Queue Management**: Tự động queue và xử lý từng operation một
- 🎯 **Simple API**: Promise-based async/await interface
- 🚀 **Production Ready**: Error handling và graceful shutdown
- 📡 **Real-time Status**: Event-based status updates

## Cài đặt

### 1. Cài đặt Python dependencies

```bash
cd ..
pip3 install -r requirements.txt
```

### 2. Cài đặt Node.js dependencies

```bash
cd nodejs
npm install
```

## Sử dụng

### Option 1: Sử dụng trực tiếp trong Node.js code

```javascript
const NFCManager = require('./nfc-manager');

async function main() {
  const nfcManager = new NFCManager();

  // Lắng nghe status events
  nfcManager.on('status', (status) => {
    console.log('Status:', status.message);
  });

  // Khởi tạo
  await nfcManager.init();

  // Write dữ liệu
  const data = {
    name: 'Tiến Dũng',
    id: 12345,
    email: 'tien.dung@example.com'
  };

  const writeResult = await nfcManager.write(data);
  console.log('Write result:', writeResult);

  // Read dữ liệu
  const readData = await nfcManager.read();
  console.log('Read data:', readData);

  // Format thẻ (xóa dữ liệu)
  await nfcManager.format();

  // Shutdown
  nfcManager.shutdown();
}

main().catch(console.error);
```

**Chạy example:**

```bash
node example.js
```

### Option 2: Chạy REST API Server

```bash
node server.js
```

Server sẽ chạy tại `http://localhost:3000`

## API Endpoints

### 1. Health Check

```bash
GET /health
```

Response:
```json
{
  "success": true,
  "ready": true,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 2. Write to NFC

```bash
POST /nfc/write
Content-Type: application/json

{
  "data": {
    "name": "Tiến Dũng",
    "id": 12345,
    "email": "tien.dung@example.com"
  },
  "startBlock": 4,
  "debug": false
}
```

**Curl example:**

```bash
curl -X POST http://localhost:3000/nfc/write \
  -H "Content-Type: application/json" \
  -d '{
    "data": {
      "name": "Tiến Dũng",
      "id": 12345,
      "email": "tien.dung@example.com",
      "timestamp": "2024-01-01T00:00:00Z"
    }
  }'
```

Response:
```json
{
  "success": true,
  "result": {
    "message": "Data written successfully",
    "written_data": { ... }
  }
}
```

### 3. Read from NFC

```bash
POST /nfc/read
Content-Type: application/json

{
  "startBlock": 4,
  "numBlocks": 6,
  "debug": false
}
```

**Curl example:**

```bash
curl -X POST http://localhost:3000/nfc/read \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:
```json
{
  "success": true,
  "data": {
    "name": "Tiến Dũng",
    "id": 12345,
    "email": "tien.dung@example.com"
  }
}
```

### 4. Format NFC Card

```bash
POST /nfc/format
Content-Type: application/json

{
  "startBlock": 4,
  "numBlocks": 16
}
```

**Curl example:**

```bash
curl -X POST http://localhost:3000/nfc/format \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Workflow

### Sequential Operation Flow

1. Node.js nhận multiple requests từ client (có thể đồng thời)
2. NFC Manager thêm vào queue nếu worker đang bận
3. Worker xử lý từng operation một theo thứ tự FIFO
4. Mỗi operation:
   - Node.js gửi command qua stdin
   - Python đợi user đưa thẻ vào
   - Python thực hiện operation (read/write/format)
   - Python trả kết quả qua stdout
   - Node.js nhận kết quả và trả về client
5. Worker tự động lấy operation tiếp theo từ queue

### Ví dụ Queue Processing

```
Request 1 (Write) → Executing
Request 2 (Read)  → Queue position 1
Request 3 (Write) → Queue position 2

[Request 1 hoàn thành]

Request 2 (Read)  → Executing
Request 3 (Write) → Queue position 1

[Request 2 hoàn thành]

Request 3 (Write) → Executing
```

## Cấu hình

### NFC Manager Options

```javascript
const nfcManager = new NFCManager({
  scriptPath: './path'   // Đường dẫn đến nfc_worker.py (optional)
});
```

**Lưu ý:** Chỉ sử dụng 1 worker vì chỉ có 1 module PN532. Tất cả operations sẽ được xử lý tuần tự.

### Write Options

```javascript
await nfcManager.write(data, {
  startBlock: 4,         // Block bắt đầu (default: 4)
  debug: false           // Debug mode (default: false)
});
```

### Read Options

```javascript
await nfcManager.read({
  startBlock: 4,         // Block bắt đầu (default: 4)
  numBlocks: 6,          // Số blocks đọc (default: 6)
  debug: false           // Debug mode (default: false)
});
```

## Performance

- **Process Reuse**: Worker không restart sau mỗi operation
- **Sequential Execution**: Đảm bảo operations không conflict (chỉ 1 PN532)
- **Queue System**: Tự động xếp hàng và xử lý tuần tự
- **Async/Await**: Node.js code vẫn non-blocking dù operations chạy tuần tự
- **No HTTP Overhead**: Direct process communication khi dùng trực tiếp

### Benchmark

```
Traditional (spawn mỗi lần):
- Write: ~5s (spawn + init + write)
- Read:  ~5s (spawn + init + read)
Total: 10s

Single Worker (reuse):
- Write: ~2s (write only, PN532 đã init)
- Read:  ~2s (read only, PN532 đã init)
Total: 4s

Improvement: 60% faster
```

## Error Handling

```javascript
try {
  const result = await nfcManager.write(data);
} catch (error) {
  if (error.message.includes('timeout')) {
    // Handle timeout
  } else if (error.message.includes('Worker is busy')) {
    // Worker đang xử lý request khác
  } else {
    // Other errors
  }
}
```

## Debugging

Bật debug mode để xem chi tiết:

```javascript
// Trong code
await nfcManager.write(data, { debug: true });

// Hoặc trong API
POST /nfc/write
{
  "data": { ... },
  "debug": true
}
```

## Troubleshooting

### Worker không khởi động

- Kiểm tra Python3 đã cài đặt: `python3 --version`
- Kiểm tra dependencies: `pip3 list | grep adafruit`
- Kiểm tra đường dẫn script: `ls -la ../nfc_worker.py`

### Worker timeout

- Tăng timeout trong `nfc-manager.js` (dòng 84)
- Kiểm tra kết nối PN532 hardware

### Permission denied

- Thêm user vào group: `sudo usermod -a -G spi,gpio $USER`
- Reboot sau khi thêm group

### Queue getting too long

```javascript
// Check queue status
const status = nfcManager.getStatus();
console.log('Queue length:', status.queueLength);

// Optional: Reject if queue is too long
if (status.queueLength > 10) {
  throw new Error('System overloaded, try again later');
}
```

## License

MIT
