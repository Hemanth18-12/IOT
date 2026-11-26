"""
SmartRoom OpenCV Face Recognition -> Arduino USB Serial (9600 baud)

IMPORTANT:
  - College demonstration module using OpenCV Haar Cascade + LBPH (not production biometrics).
  - Preserves exact Arduino USB serial commands:
      'A' = Authorized face (unlocks door)
      'R' = Unauthorized face (triggers 5s NodeMCU buzzer & website alert)
      'L' = Manual lock (press 'l' in video window)
  - No face images or biometric encodings are ever uploaded to the backend.
  - Close Arduino IDE Serial Monitor before running so only one process holds the port.

Usage:
  python3 smartroom_face.py --port /dev/cu.usbmodem1101
  python3 smartroom_face.py --dry-run   # Test webcam recognition without Arduino connected
"""

import argparse
import glob
import json
import os
import sys
import time
import cv2
import serial


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
TRAINER_PATH = os.path.join(DATA_DIR, "trainer.yml")
LABELS_PATH = os.path.join(DATA_DIR, "labels.json")


def detect_arduino_port():
    candidates = sorted(
        glob.glob("/dev/cu.usbmodem*")
        + glob.glob("/dev/cu.usbserial*")
        + glob.glob("/dev/ttyUSB*")
        + glob.glob("/dev/ttyACM*")
    )
    return candidates[0] if candidates else None


def load_labels():
    if os.path.exists(LABELS_PATH):
        with open(LABELS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def main():
    parser = argparse.ArgumentParser(description="SmartRoom OpenCV Face Recognition Serial Bridge")
    parser.add_argument("--port", default="", help="Arduino serial port (auto-detected if omitted)")
    parser.add_argument("--baud", type=int, default=9600, help="Serial baud rate (must be 9600)")
    parser.add_argument("--camera", type=int, default=0, help="Webcam index (default: 0)")
    parser.add_argument("--threshold", type=float, default=65.0, help="LBPH confidence threshold (lower=stricter)")
    parser.add_argument("--cooldown", type=float, default=4.0, help="Seconds before repeating A/R command")
    parser.add_argument("--dry-run", action="store_true", help="Run camera without opening serial port")
    args = parser.parse_args()

    if not os.path.exists(TRAINER_PATH):
        print(
            f"Error: Trained model not found at {TRAINER_PATH}. Enroll faces first with register_face.py.",
            file=sys.stderr,
        )
        sys.exit(1)

    labels = load_labels()
    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.read(TRAINER_PATH)

    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    face_cascade = cv2.CascadeClassifier(cascade_path)

    ser = None
    if not args.dry_run:
        port = args.port or detect_arduino_port()
        if not port:
            print(
                "Error: No Arduino USB serial port detected. Plug in Arduino or pass --port / --dry-run.",
                file=sys.stderr,
            )
            sys.exit(1)
        print(f"Opening Arduino serial port {port} at {args.baud} baud...")
        ser = serial.Serial(port, args.baud, timeout=1)
        time.sleep(2.0)  # Wait for Arduino Uno serial reset

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        if ser is not None:
            ser.close()
        print(f"Error: Could not open webcam index {args.camera}", file=sys.stderr)
        sys.exit(1)

    last_sent_time = {"A": 0.0, "R": 0.0}

    def send_cmd(cmd_char):
        now = time.monotonic()
        if cmd_char in last_sent_time and (now - last_sent_time[cmd_char]) < args.cooldown:
            return False
        if cmd_char in last_sent_time:
            last_sent_time[cmd_char] = now
        if ser is not None:
            ser.write(cmd_char.encode("ascii"))
        print(f"[Serial TX -> Arduino] '{cmd_char}' ({'dry-run' if args.dry_run else 'sent'})")
        return True

    print("SmartRoom Face Recognition active. Keys: [l] Lock Door ('L'), [q] Quit.")
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))

            for (x, y, w, h) in faces:
                roi = cv2.resize(gray[y : y + h, x : x + w], (200, 200))
                label_id, confidence = recognizer.predict(roi)

                if confidence < args.threshold and str(label_id) in labels:
                    name = labels[str(label_id)]
                    text = f"{name} ({confidence:.1f})"
                    color = (94, 197, 34)  # Green
                    send_cmd("A")
                else:
                    text = f"UNKNOWN ({confidence:.1f})"
                    color = (68, 68, 239)  # Red
                    send_cmd("R")

                cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
                cv2.putText(frame, text, (x, max(24, y - 10)), cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

            cv2.imshow("SmartRoom Face Recognition (Demo)", frame)
            key = cv2.waitKey(15) & 0xFF
            if key == ord("q"):
                break
            if key == ord("l"):
                send_cmd("L")
    finally:
        cap.release()
        cv2.destroyAllWindows()
        if ser is not None:
            ser.close()
        print("Released camera and serial resources cleanly.")


if __name__ == "__main__":
    main()
