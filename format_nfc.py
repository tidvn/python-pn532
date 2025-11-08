"""
Format/Clear NFC card
"""

from nfc import init_pn532, format_nfc_card

if __name__ == "__main__":
    print("=== NFC Card Formatter ===\n")
    
    # Initialize the PN532
    print("Initializing PN532...")
    pn532 = init_pn532()
    
    print("\n⚠️  WARNING: This will erase all data on the card!")
    print("Place your NFC card on the reader to format it...\n")
    
    # Format the NFC card (clear 16 blocks)
    success = format_nfc_card(pn532, start_block=4, num_blocks=16)
    
    if success:
        print("\n✓ Card formatted successfully!")
        print("The card is now ready for new data.")
    else:
        print("\n✗ Failed to format card")
