"""
SmartRoom Face Enrollment Utility (College Demonstration Module)

Captures grayscale face samples from the laptop webcam using OpenCV Haar Cascade,
trains an LBPH face recognizer, and stores dataset + model strictly locally under
scripts/face_recognition/data/ (never uploaded to backend or cloud).

Usage:
  python3 register_face.py --name "Hemanth" --id 1 --samples 30
"""

import argparse
import json
import os
import sys
import cv2
import numpy as np


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DATASET_DIR = os.path.join(DATA_DIR, "dataset")
TRAINER_PATH = os.path.join(DATA_DIR, "trainer.yml")
LABELS_PATH = os.path.join(DATA_DIR, "labels.json")


def load_labels():
    if os.path.exists(LABELS_PATH):
        with open(LABELS_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_labels(labels):
    with open(LABELS_PATH, "w", encoding="utf-8") as f:
        json.dump(labels, f, indent=2)


def train_lbph():
    faces = []
    ids = []
    if not os.path.exists(DATASET_DIR):
        return 0

    for filename in sorted(os.listdir(DATASET_DIR)):
        if not filename.endswith(".jpg"):
            continue
        parts = filename.split(".")
        if len(parts) < 3 or not parts[1].isdigit():
            continue
        face_id = int(parts[1])
        img_path = os.path.join(DATASET_DIR, filename)
        img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
        if img is not None:
            faces.append(img)
            ids.append(face_id)

    if not faces:
        return 0

    recognizer = cv2.face.LBPHFaceRecognizer_create()
    recognizer.train(faces, np.array(ids))
    recognizer.save(TRAINER_PATH)
    return len(faces)


def main():
    parser = argparse.ArgumentParser(description="Enroll an authorized face for SmartRoom")
    parser.add_argument("--name", required=True, help="Person name (e.g., Hemanth)")
    parser.add_argument("--id", type=int, default=1, help="Numeric label ID (default: 1)")
    parser.add_argument("--samples", type=int, default=30, help="Number of face samples to capture")
    parser.add_argument("--camera", type=int, default=0, help="Webcam index (default: 0)")
    args = parser.parse_args()

    os.makedirs(DATASET_DIR, exist_ok=True)
    cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
    face_cascade = cv2.CascadeClassifier(cascade_path)

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        print(f"Error: Could not open webcam index {args.camera}", file=sys.stderr)
        sys.exit(1)

    labels = load_labels()
    labels[str(args.id)] = args.name
    save_labels(labels)

    count = 0
    print(f"Look at the camera to capture {args.samples} samples for '{args.name}' (press 'q' to stop)...")
    try:
        while count < args.samples:
            ok, frame = cap.read()
            if not ok:
                continue
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            detected = face_cascade.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=5, minSize=(80, 80))

            for (x, y, w, h) in detected:
                count += 1
                roi = cv2.resize(gray[y : y + h, x : x + w], (200, 200))
                out_file = os.path.join(DATASET_DIR, f"User.{args.id}.{count}.jpg")
                cv2.imwrite(out_file, roi)
                cv2.rectangle(frame, (x, y), (x + w, y + h), (21, 204, 250), 2)
                cv2.putText(
                    frame,
                    f"Capturing {count}/{args.samples}",
                    (x, max(20, y - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (21, 204, 250),
                    2,
                )
                if count >= args.samples:
                    break

            cv2.imshow("SmartRoom Face Enrollment", frame)
            if cv2.waitKey(30) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()

    total_trained = train_lbph()
    print(f"Training complete using {total_trained} local face samples -> {TRAINER_PATH}")


if __name__ == "__main__":
    main()
