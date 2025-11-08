"""
NFC JSON Reader/Writer
Functions to write and read JSON data to/from MiFare Classic NFC cards
"""

import json
import board
import busio
from digitalio import DigitalInOut
from adafruit_pn532.adafruit_pn532 import MIFARE_CMD_AUTH_B
from adafruit_pn532.spi import PN532_SPI


# Default MiFare Classic authentication key
DEFAULT_KEY = b"\xff\xff\xff\xff\xff\xff"

# Initialize PN532 with SPI
def init_pn532():
    """Initialize and configure the PN532 NFC reader"""
    spi = busio.SPI(board.SCK, board.MOSI, board.MISO)
    cs_pin = DigitalInOut(board.D5)
    pn532 = PN532_SPI(spi, cs_pin, debug=False)
    
    # Get firmware version
    ic, ver, rev, support = pn532.firmware_version
    print(f"Found PN532 with firmware version: {ver}.{rev}")
    
    # Configure PN532 to communicate with MiFare cards
    pn532.SAM_configuration()
    
    return pn532


def wait_for_card(pn532, timeout=0.5):
    """Wait for an NFC card to be present"""
    print("Waiting for NFC card...")
    while True:
        uid = pn532.read_passive_target(timeout=timeout)
        print(".", end="")
        if uid is not None:
            print("")
            print("Found card with UID:", [hex(i) for i in uid])
            return uid


def is_sector_trailer(block_num):
    """Check if block is a sector trailer (not writable for data)"""
    # Sector trailers are at blocks 3, 7, 11, 15, 19, 23, etc.
    return (block_num + 1) % 4 == 0


def get_next_data_block(block_num):
    """Get next valid data block, skipping sector trailers"""
    next_block = block_num + 1
    if is_sector_trailer(next_block):
        next_block += 1
    return next_block


def format_nfc_card(pn532, start_block=4, num_blocks=16, key=DEFAULT_KEY):
    """
    Format/clear NFC card by writing zeros to data blocks
    
    Args:
        pn532: Initialized PN532 object
        start_block: Starting block number (default: 4)
        num_blocks: Number of blocks to clear (default: 16)
        key: Authentication key (default: factory key)
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Wait for card
        uid = wait_for_card(pn532)
        
        print(f"Formatting card - clearing {num_blocks} block(s)...")
        
        # Clear blocks
        block_num = start_block
        blocks_cleared = 0
        
        while blocks_cleared < num_blocks:
            # Skip sector trailers
            if is_sector_trailer(block_num):
                block_num = get_next_data_block(block_num - 1)
                print(f"Skipping sector trailer at block {block_num - 1}")
                continue
            
            # Authenticate block
            print(f"Clearing block {block_num}...")
            authenticated = pn532.mifare_classic_authenticate_block(
                uid, block_num, MIFARE_CMD_AUTH_B, key
            )
            
            if not authenticated:
                print(f"Authentication failed for block {block_num}!")
                return False
            
            # Write zeros
            data = bytearray(16)  # All zeros
            pn532.mifare_classic_write_block(block_num, data)
            
            blocks_cleared += 1
            block_num = get_next_data_block(block_num)
        
        print("✓ Card formatted successfully!")
        return True
        
    except Exception as e:
        print(f"Error formatting NFC card: {e}")
        return False


def write_json_to_nfc(pn532, json_data, start_block=4, key=DEFAULT_KEY, debug=False):
    """
    Write JSON data to NFC card
    
    Args:
        pn532: Initialized PN532 object
        json_data: Dictionary to write to the card
        start_block: Starting block number (default: 4)
        key: Authentication key (default: factory key)
        debug: Show detailed output (default: False)
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Wait for card
        uid = wait_for_card(pn532)
        
        # Convert JSON to string and then to bytes
        json_string = json.dumps(json_data, ensure_ascii=False)
        json_bytes = json_string.encode('utf-8')
        
        print(f"JSON data: {json_string}")
        if debug:
            print(f"Data length: {len(json_bytes)} bytes")
        
        # Calculate number of blocks needed (16 bytes per block)
        num_blocks = (len(json_bytes) + 15) // 16
        if debug:
            print(f"Writing to {num_blocks} block(s)...")
        
        # Write data to blocks
        block_num = start_block
        for i in range(num_blocks):
            # Skip sector trailers
            if is_sector_trailer(block_num):
                block_num = get_next_data_block(block_num - 1)
                if debug:
                    print(f"Skipping sector trailer, using block {block_num}")
            
            # Authenticate block
            if debug:
                print(f"Authenticating block {block_num}...")
            authenticated = pn532.mifare_classic_authenticate_block(
                uid, block_num, MIFARE_CMD_AUTH_B, key
            )
            
            if not authenticated:
                print(f"Authentication failed for block {block_num}!")
                return False
            
            # Prepare 16-byte chunk
            start_idx = i * 16
            end_idx = min(start_idx + 16, len(json_bytes))
            chunk = json_bytes[start_idx:end_idx]
            
            # Pad with zeros if needed
            data = bytearray(16)
            data[0:len(chunk)] = chunk
            
            # Write to card
            pn532.mifare_classic_write_block(block_num, data)
            if debug:
                print(f"Wrote block {block_num}: {chunk.decode('utf-8', errors='ignore')}")
            
            # Move to next block
            block_num = get_next_data_block(block_num)
        
        print("✓ JSON data written successfully!")
        return True
        
    except Exception as e:
        print(f"Error writing JSON to NFC: {e}")
        return False


def read_json_from_nfc(pn532, start_block=4, num_blocks=4, key=DEFAULT_KEY, debug=False):
    """
    Read JSON data from NFC card
    
    Args:
        pn532: Initialized PN532 object
        start_block: Starting block number (default: 4)
        num_blocks: Number of blocks to read (default: 4, i.e., 64 bytes)
        key: Authentication key (default: factory key)
        debug: Show detailed output (default: False)
    
    Returns:
        dict: Parsed JSON data, or None if failed
    """
    try:
        # Wait for card
        uid = wait_for_card(pn532)
        
        # Read data from blocks
        all_data = bytearray()
        
        block_num = start_block
        for i in range(num_blocks):
            # Skip sector trailers
            if is_sector_trailer(block_num):
                block_num = get_next_data_block(block_num - 1)
                if debug:
                    print(f"Skipping sector trailer, using block {block_num}")
            
            # Authenticate block
            if debug:
                print(f"Authenticating block {block_num}...")
            authenticated = pn532.mifare_classic_authenticate_block(
                uid, block_num, MIFARE_CMD_AUTH_B, key
            )
            
            if not authenticated:
                print(f"Authentication failed for block {block_num}!")
                return None
            
            # Read block
            block_data = pn532.mifare_classic_read_block(block_num)
            all_data.extend(block_data)
            if debug:
                print(f"Read block {block_num}: {[hex(x) for x in block_data]}")
            
            # Move to next block
            block_num = get_next_data_block(block_num)
        
        # Convert bytes to string, removing null bytes
        json_string = all_data.decode('utf-8', errors='ignore').rstrip('\x00')
        
        # Check if card is empty
        if not json_string or json_string.strip() == '':
            print("ℹ️  Card is empty - no data found")
            return None
        
        # Parse JSON
        json_data = json.loads(json_string)
        print(f"JSON data: {json_string}")
        
        return json_data
        
    except json.JSONDecodeError as e:
        if debug:
            print(f"Error parsing JSON: {e}")
        print("ℹ️  Card may be empty or contain invalid JSON data")
        return None
    except Exception as e:
        print(f"Error reading JSON from NFC: {e}")
        return None


# Example usage
if __name__ == "__main__":
    # Initialize the PN532
    pn532 = init_pn532()
    
    # Example: Write JSON to NFC
    print("\n=== WRITE JSON TO NFC ===")
    sample_data = {
        "name": "John Doe",
        "id": 12345,
        "active": True
    }
    write_json_to_nfc(pn532, sample_data)
    
    # Wait a moment
    print("\nRemove and place the card again to read...")
    input("Press Enter when ready...")
    
    # Example: Read JSON from NFC
    print("\n=== READ JSON FROM NFC ===")
    data = read_json_from_nfc(pn532, num_blocks=4)
    
    if data:
        print(f"\nSuccessfully retrieved data: {data}")
