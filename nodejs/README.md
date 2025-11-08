# NFC Node.js Worker Manager

Giải pháp hiệu suất cao để giao tiếp giữa Node.js và Python cho thao tác NFC, sử dụng worker process pool.

## Kiến trúc

```
┌─────────────────────────────────────────┐
│         Node.js Application             │
│  ┌───────────────────────────────────┐  │
│  │      NFC Manager (Pool)           │  │
│  │  ┌─────────────┐ ┌─────────────┐ │  │
│  │  │  Worker 1   │ │  Worker N   │ │  │
│  │  └─────────────┘ └─────────────┘ │  │
│  └───────────────────────────────────┘  │
└──────────────┬──────────────────────────┘
               │ stdin/stdout (JSON)
               ▼
┌─────────────────────────────────────────┐
│      Python NFC Worker Process          │
│  ┌───────────────────────────────────┐  │
│  │      PN532 NFC Operations         │  │
│  │  • Read  • Write  • Format        │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Tính năng

- ✨ **High Performance**: Worker pool với process reuse
- 🔄 **Asynchronous**: Non-blocking operations
- 📊 **Queue Management**: Tự động queue khi workers bận
- 🎯 **Simple API**: Promise-based interface
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
  const nfcManager = new NFCManager({
    poolSize: 1 // 1 worker cho 1 NFC reader
  });

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

### Write Operation

1. Node.js nhận request từ client
2. NFC Manager chọn worker available từ pool
3. Worker gửi command đến Python process qua stdin
4. Python đợi user đưa thẻ vào
5. Python write dữ liệu và trả kết quả qua stdout
6. Node.js nhận kết quả và trả về client

### Read Operation

1. Node.js nhận request từ client
2. NFC Manager chọn worker available từ pool
3. Worker gửi command đến Python process qua stdin
4. Python đợi user đưa thẻ vào
5. Python đọc dữ liệu và trả kết quả qua stdout
6. Node.js nhận kết quả và trả về client

## Cấu hình

### NFC Manager Options

```javascript
const nfcManager = new NFCManager({
  poolSize: 1,           // Số lượng workers (thường = số NFC readers)
  scriptPath: './path'   // Đường dẫn đến nfc_worker.py
});
```

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

- **Process Reuse**: Workers không restart sau mỗi operation
- **Connection Pooling**: Tái sử dụng PN532 connection
- **Queue System**: Tự động xếp hàng requests khi busy
- **No HTTP Overhead**: Direct process communication khi dùng trực tiếp

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

- Tăng timeout trong `nfc-manager.js` (dòng 57)
- Kiểm tra kết nối PN532 hardware

### Permission denied

- Thêm user vào group: `sudo usermod -a -G spi,gpio $USER`
- Reboot sau khi thêm group

## License

MIT
