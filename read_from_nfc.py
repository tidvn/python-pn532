"""
Read JSON data from NFC card
"""

from nfc import init_pn532, read_json_from_nfc

if __name__ == "__main__":
    print("=== NFC JSON Reader ===\n")
    
    # Initialize the PN532
    print("Initializing PN532...")
    pn532 = init_pn532()
    
    print("\nPlace your NFC card on the reader...\n")
    
    # Read JSON from NFC card (6 blocks to ensure we get all data, debug=False for clean output)
    data = read_json_from_nfc(pn532, num_blocks=6, debug=False)
    
    if data:
        print("\n✓ Successfully read data from NFC card!")
        print("\n--- Retrieved Data ---")
        for key, value in data.items():
            print(f"  {key}: {value}")
    else:
        print("\n📭 No data on NFC card")
        print("Tip: Use 'python write_to_nfc.py' to write data to the card")
