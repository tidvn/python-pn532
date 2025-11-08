#!/usr/bin/env python3
"""
NFC Worker Process
Handles NFC read/write operations via stdin/stdout JSON communication
"""

import sys
import json
from nfc import init_pn532, write_json_to_nfc, read_json_from_nfc, format_nfc_card

def send_response(success, data=None, error=None):
    """Send JSON response to stdout"""
    response = {
        "success": success,
        "data": data,
        "error": error
    }
    print(json.dumps(response, ensure_ascii=False), flush=True)
    sys.stdout.flush()

def send_status(status, message):
    """Send status update to stdout"""
    response = {
        "status": status,
        "message": message
    }
    print(json.dumps(response, ensure_ascii=False), flush=True)
    sys.stdout.flush()

def handle_write(pn532, params):
    """Handle write operation"""
    try:
        json_data = params.get('data')
        start_block = params.get('start_block', 4)
        debug = params.get('debug', False)

        if not json_data:
            send_response(False, error="No data provided")
            return

        send_status("waiting", "Waiting for NFC card...")

        # Write JSON to NFC
        success = write_json_to_nfc(pn532, json_data, start_block=start_block, debug=debug)

        if success:
            send_response(True, data={"message": "Data written successfully", "written_data": json_data})
        else:
            send_response(False, error="Failed to write data to NFC card")

    except Exception as e:
        send_response(False, error=str(e))

def handle_read(pn532, params):
    """Handle read operation"""
    try:
        start_block = params.get('start_block', 4)
        num_blocks = params.get('num_blocks', 6)
        debug = params.get('debug', False)

        send_status("waiting", "Waiting for NFC card...")

        # Read JSON from NFC
        data = read_json_from_nfc(pn532, start_block=start_block, num_blocks=num_blocks, debug=debug)

        if data is not None:
            send_response(True, data=data)
        else:
            send_response(False, error="No data found on NFC card or card is empty")

    except Exception as e:
        send_response(False, error=str(e))

def handle_format(pn532, params):
    """Handle format operation"""
    try:
        start_block = params.get('start_block', 4)
        num_blocks = params.get('num_blocks', 16)

        send_status("waiting", "Waiting for NFC card...")

        # Format NFC card
        success = format_nfc_card(pn532, start_block=start_block, num_blocks=num_blocks)

        if success:
            send_response(True, data={"message": "Card formatted successfully"})
        else:
            send_response(False, error="Failed to format NFC card")

    except Exception as e:
        send_response(False, error=str(e))

def main():
    """Main worker loop"""
    try:
        # Initialize PN532
        send_status("initializing", "Initializing PN532...")
        pn532 = init_pn532()
        send_status("ready", "PN532 initialized and ready")

        # Process commands from stdin
        for line in sys.stdin:
            try:
                command = json.loads(line.strip())
                action = command.get('action')
                params = command.get('params', {})

                if action == 'write':
                    handle_write(pn532, params)
                elif action == 'read':
                    handle_read(pn532, params)
                elif action == 'format':
                    handle_format(pn532, params)
                elif action == 'exit':
                    send_response(True, data={"message": "Worker shutting down"})
                    break
                else:
                    send_response(False, error=f"Unknown action: {action}")

            except json.JSONDecodeError as e:
                send_response(False, error=f"Invalid JSON: {str(e)}")
            except Exception as e:
                send_response(False, error=f"Error processing command: {str(e)}")

    except KeyboardInterrupt:
        send_response(False, error="Worker interrupted")
    except Exception as e:
        send_response(False, error=f"Worker initialization failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()
