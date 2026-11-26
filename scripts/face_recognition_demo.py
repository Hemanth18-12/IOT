"""
Reference Python OpenCV -> Arduino USB Serial Face Recognition Integration

IMPORTANT DISCLAIMER:
  This is a college demonstration script and is NOT a production-grade biometric
  security system. It sends single-byte commands ('A', 'R', 'L') to the Arduino Uno
  over USB Serial (9600 baud), matching the existing hardware protocol.
  No face images or biometric encodings are uploaded to the backend.

Serial Port Notes:
  - CLOSE the Arduino IDE Serial Monitor before running your Python face script;
    macOS/Windows allow only one process to open the Arduino USB serial port.
  - macOS port example: /dev/cu.usbmodem1101 or /dev/cu.usbserial-110 (list with: ls /dev/cu.usb*)
  - Windows port example: COM3 or COM4 (check Device Manager -> Ports)
  - In your OpenCV loop, apply a 3-5 second cooldown before resending 'A' or 'R'
    so keeping a face in front of the camera does not flood alerts/emails.
"""

import argparse
import time
import serial  # pip install pyserial


def main():
    parser = argparse.ArgumentParser(description="SmartRoom USB Serial Face Command Sender")
    parser.add_argument(
        "--port",
        required=True,
        help="Arduino serial port (macOS: /dev/cu.usbmodem*, Windows: COM3)",
    )
    parser.add_argument("--baud", type=int, default=9600, help="Baud rate (must be 9600)")
    parser.add_argument(
        "--cooldown",
        type=float,
        default=3.0,
        help="Minimum seconds between repeated A/R commands to prevent alert flooding",
    )
    args = parser.parse_args()

    print(f"Opening {args.port} at {args.baud} baud...")
    last_sent = {}
    with serial.Serial(args.port, args.baud, timeout=1) as ser:
        time.sleep(2.0)  # Wait for Arduino Uno auto-reset on serial open
        print("Connected. Type A (Authorized), R (Unauthorized), L (Lock), or Q (Quit):")
        while True:
            cmd = input("> ").strip().upper()
            if cmd == "Q":
                break
            if cmd in ("A", "R", "L"):
                now = time.monotonic()
                if cmd in ("A", "R") and now - last_sent.get(cmd, 0.0) < args.cooldown:
                    remaining = args.cooldown - (now - last_sent[cmd])
                    print(f"Cooldown active ({remaining:.1f}s remaining) to prevent flooding.")
                    continue
                ser.write(cmd.encode("ascii"))
                last_sent[cmd] = now
                print(f"Sent '{cmd}' to Arduino.")
            else:
                print("Valid commands: A, R, L, Q")


if __name__ == "__main__":
    main()
