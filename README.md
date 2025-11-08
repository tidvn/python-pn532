# NFC JSON Reader/Writer

A Python library for reading and writing JSON data to MiFare Classic NFC cards using the Adafruit PN532 NFC/RFID reader.

## Hardware Requirements

- **PN532 NFC/RFID Reader Module** (SPI, I2C, or UART)
- **MiFare Classic 1K NFC Cards**
- **Raspberry Pi or compatible board** with GPIO support

## Connection

This project uses SPI connection by default:

| PN532 Pin | Raspberry Pi Pin |
|-----------|------------------|
| SCK       | SCK (GPIO 11)    |
| MOSI      | MOSI (GPIO 10)   |
| MISO      | MISO (GPIO 9)    |
| CS        | D5 (GPIO 5)      |
| GND       | GND              |
| VCC       | 3.3V             |

## Installation

1. Install required dependencies:
```bash
pip install -r requirements.txt
```

2. Verify the connection:
```bash
python example/simpletest.py
```

## Project Structure

```
.
├── nfc.py                  # Main library with core functions
├── nfc_worker.py           # Worker process for Node.js integration
├── write_to_nfc.py         # Script to write JSON data to NFC card
├── read_from_nfc.py        # Script to read JSON data from NFC card
├── format_nfc.py           # Script to format/clear NFC card
├── requirements.txt        # Python dependencies
├── nodejs/                 # Node.js integration
│   ├── nfc-manager.js      # High-performance worker pool manager
│   ├── server.js           # Express.js REST API server
│   ├── example.js          # Direct usage example
│   ├── test-api.sh         # API test script
│   ├── package.json        # Node.js dependencies
│   └── README.md           # Node.js documentation
└── example/                # Example scripts from Adafruit
    ├── readwrite_mifare.py
    ├── simpletest.py
    └── ...
```

## Usage

### Python Direct Usage

#### 1. Write JSON Data to NFC Card

Edit `write_to_nfc.py` to customize your data:

```python
data_to_write = {
    "name": "Tiến Dũng",
    "id": 12345,
    "email": "john@example.com",
    "active": True
}
```

Then run:
```bash
python write_to_nfc.py
```

#### 2. Read JSON Data from NFC Card

```bash
python read_from_nfc.py
```

Output example:
```
JSON data: {"name": "Tiến Dũng", "id": 12345, "email": "john@example.com", "active": true}

✓ Successfully read data from NFC card!

--- Retrieved Data ---
  name: Tiến Dũng
  id: 12345
  email: john@example.com
  active: True
```

#### 3. Format/Clear NFC Card

To erase all data on the card:
```bash
python format_nfc.py
```

### Node.js Integration (Recommended for Production)

Giải pháp hiệu suất cao sử dụng worker process pool để giao tiếp giữa Node.js và Python.

#### Quick Start

1. **Cài đặt dependencies:**

```bash
cd nodejs
npm install
```

2. **Sử dụng trực tiếp trong Node.js:**

```javascript
const NFCManager = require('./nodejs/nfc-manager');

const nfcManager = new NFCManager();
await nfcManager.init();

// Write
await nfcManager.write({
  name: 'Tiến Dũng',
  id: 12345
});

// Read
const data = await nfcManager.read();
console.log(data);
```

3. **Hoặc chạy REST API Server:**

```bash
cd nodejs
node server.js
```

**API Examples:**

```bash
# Write to NFC
curl -X POST http://localhost:3000/nfc/write \
  -H "Content-Type: application/json" \
  -d '{"data": {"name": "Tiến Dũng", "id": 12345}}'

# Read from NFC
curl -X POST http://localhost:3000/nfc/read \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Ưu điểm của Node.js integration:**
- ✨ Hiệu suất cao với process reuse (60% faster)
- 🔄 Sequential operations với auto queue
- 📊 Async/await interface dù operations chạy tuần tự
- 🚀 Production-ready với REST API
- 📡 Real-time status updates

👉 **Xem [nodejs/README.md](nodejs/README.md) để biết chi tiết đầy đủ**

## Library Functions

### Core Functions in `nfc.py`

#### `init_pn532()`
Initialize and configure the PN532 NFC reader.

```python
from nfc import init_pn532

pn532 = init_pn532()
```

#### `write_json_to_nfc(pn532, json_data, start_block=4, key=DEFAULT_KEY, debug=False)`
Write JSON data to an NFC card.

**Parameters:**
- `pn532`: Initialized PN532 object
- `json_data`: Dictionary to write
- `start_block`: Starting block number (default: 4)
- `key`: Authentication key (default: factory key `0xFFFFFFFFFFFF`)
- `debug`: Show detailed output (default: False)

**Returns:** `True` if successful, `False` otherwise

**Example:**
```python
from nfc import init_pn532, write_json_to_nfc

pn532 = init_pn532()
data = {"name": "John", "id": 123}
success = write_json_to_nfc(pn532, data, debug=False)
```

#### `read_json_from_nfc(pn532, start_block=4, num_blocks=6, key=DEFAULT_KEY, debug=False)`
Read JSON data from an NFC card.

**Parameters:**
- `pn532`: Initialized PN532 object
- `start_block`: Starting block number (default: 4)
- `num_blocks`: Number of blocks to read (default: 6, i.e., 96 bytes)
- `key`: Authentication key (default: factory key)
- `debug`: Show detailed output (default: False)

**Returns:** Dictionary with parsed JSON data, or `None` if failed

**Example:**
```python
from nfc import init_pn532, read_json_from_nfc

pn532 = init_pn532()
data = read_json_from_nfc(pn532, num_blocks=6, debug=False)
if data:
    print(f"Name: {data['name']}")
```

#### `format_nfc_card(pn532, start_block=4, num_blocks=16, key=DEFAULT_KEY)`
Format/clear NFC card by writing zeros to data blocks.

**Parameters:**
- `pn532`: Initialized PN532 object
- `start_block`: Starting block number (default: 4)
- `num_blocks`: Number of blocks to clear (default: 16)
- `key`: Authentication key (default: factory key)

**Returns:** `True` if successful, `False` otherwise

**Example:**
```python
from nfc import init_pn532, format_nfc_card

pn532 = init_pn532()
success = format_nfc_card(pn532, num_blocks=16)
```

## MiFare Classic Block Structure

MiFare Classic 1K cards have 64 blocks (0-63):
- **Block 0**: Manufacturer data (read-only)
- **Blocks 1-2**: Data blocks
- **Block 3**: Sector trailer (keys & access bits)
- **Blocks 4-6**: Data blocks
- **Block 7**: Sector trailer
- **...and so on**

The library automatically skips sector trailer blocks (3, 7, 11, 15, etc.) when reading/writing data.

## Limitations

- **Maximum JSON size**: Approximately 96-160 bytes per write operation
- **Sector trailers**: Cannot be used for data storage
- **Authentication**: Uses default factory key (`0xFFFFFFFFFFFF`)
- **Card type**: Works with MiFare Classic 1K cards

## Troubleshooting

### Authentication Failed
- Ensure you're using the correct authentication key
- Some blocks may have custom keys set
- Try a different block range

### Card Not Detected
- Check physical connections
- Verify PN532 firmware version with `simpletest.py`
- Ensure card is placed flat on the reader
- Try moving the card closer/further

### JSON Parse Error
- Card may be empty (run `format_nfc.py` first)
- Increase `num_blocks` when reading
- Data may be corrupted

### Unicode Support
The library fully supports Unicode characters (Vietnamese, Chinese, emojis, etc.):
```python
data = {
    "name": "Nguyễn Văn A",
    "city": "Hà Nội",
    "message": "Xin chào! 👋"
}
```

## Debug Mode

Enable debug mode to see detailed output:

```python
# Write with debug
write_json_to_nfc(pn532, data, debug=True)

# Read with debug
data = read_json_from_nfc(pn532, debug=True)
```

Debug output includes:
- Block authentication status
- Byte-level read/write operations
- Sector trailer skipping
- Data length information

## License

Based on Adafruit PN532 examples:
- SPDX-FileCopyrightText: 2015 Tony DiCola, Roberto Laricchia, and Francesco Crisafulli, for Adafruit Industries
- SPDX-License-Identifier: MIT

## Resources

- [Adafruit PN532 Library](https://github.com/adafruit/Adafruit_CircuitPython_PN532)
- [MiFare Classic Documentation](https://www.nxp.com/docs/en/data-sheet/MF1S50YYX_V1.pdf)
- [Adafruit PN532 Breakout Guide](https://learn.adafruit.com/adafruit-pn532-rfid-nfc)

## Contributing

Feel free to submit issues and enhancement requests!

## Author

Created for NFC JSON data storage applications.
