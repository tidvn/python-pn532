"""
Write JSON data to NFC card
"""

from nfc import init_pn532, write_json_to_nfc

# Sample data to write
data_to_write = {
    "name": "Tiến Dũng",
    "id": 12345,
    "email": "john@example.com",
    "active": True
}

if __name__ == "__main__":
    print("=== NFC JSON Writer ===\n")
    
    # Initialize the PN532
    print("Initializing PN532...")
    pn532 = init_pn532()
    
    print(f"\nData to write: {data_to_write}\n")
    
    # Write JSON to NFC card (debug=False for clean output)
    success = write_json_to_nfc(pn532, data_to_write, debug=False)
    
    if success:
        print("\n✓ Data written successfully!")
    else:
        print("\n✗ Failed to write data")
