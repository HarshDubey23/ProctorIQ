"""Collect face landmark clips from webcam using MediaPipe FaceMesh.

Usage:
    python collect.py --label focused --clips 10 --duration 3
    python collect.py --label distracted --clips 5 --duration 5 --device 1
"""


import argparse
import time
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect face landmark clips for ProctorIQ ML pipeline")
    parser.add_argument("--label", required=True, choices=["focused", "distracted", "absent", "drowsy"],
                        help="Class label for the clips being collected")
    parser.add_argument("--clips", type=int, default=10,
                        help="Number of clips to collect (default: 10)")
    parser.add_argument("--duration", type=float, default=3.0,
                        help="Duration in seconds per clip (default: 3.0)")
    parser.add_argument("--device", type=int, default=0,
                        help="Camera device index (default: 0)")
    parser.add_argument("--output", type=str, default="data/raw",
                        help="Output directory for .npy files (default: data/raw)")
    parser.add_argument("--tag", type=str, default=None,
                        help="Optional contributor tag, e.g. --tag priya. Creates a "
                             "subfolder so multiple people's clips never collide.")
    return parser.parse_args()


def find_next_start_index(output_dir: Path, label: str) -> int:
    """Scan existing clips for this label so re-running never overwrites previous ones."""
    existing = output_dir.glob(f"{label}_*.npy")
    indices = []
    for f in existing:
        try:
            indices.append(int(f.stem.rsplit("_", 1)[1]))
        except (IndexError, ValueError):
            continue
    return max(indices, default=0)


def draw_overlay(frame: np.ndarray, text: str, color: tuple[int, int, int],
                 size: float = 1.5) -> None:
    h, w = frame.shape[:2]
    (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_DUPLEX, size, 2)
    cx, cy = (w - tw) // 2, h // 2 - 30
    cv2.putText(frame, text, (cx, cy), cv2.FONT_HERSHEY_DUPLEX, size, color, 2)
    cv2.putText(frame, text, (cx, cy), cv2.FONT_HERSHEY_DUPLEX, size, (0, 0, 0), 4)


def run_countdown(cap: cv2.VideoCapture, seconds: int) -> bool:
    for i in range(seconds, 0, -1):
        for _ in range(5):
            ok, frame = cap.read()
            if not ok:
                return False
            draw_overlay(frame, f"{i}", (0, 255, 0), 4.0)
            cv2.putText(frame, "Get ready...", (20, 40),
                        cv2.FONT_HERSHEY_DUPLEX, 0.7, (200, 200, 200), 1)
            cv2.imshow("ProctorIQ — Collect Landmarks", frame)
            key = cv2.waitKey(200) & 0xFF
            if key == 27:
                return False
    return True


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output)
    if args.tag:
        output_dir = output_dir / args.tag
    output_dir.mkdir(parents=True, exist_ok=True)

    start_index = find_next_start_index(output_dir, args.label)

    mp_face_mesh = mp.solutions.face_mesh
    face_mesh = mp_face_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    cap = cv2.VideoCapture(args.device)
    if not cap.isOpened():
        print(f"Error: Cannot open camera device {args.device}")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    cap.set(cv2.CAP_PROP_FPS, 30)

    collected = 0
    clip_num = 0

    cv2.namedWindow("ProctorIQ — Collect Landmarks", cv2.WINDOW_NORMAL)
    cv2.resizeWindow("ProctorIQ — Collect Landmarks", 800, 600)

    while collected < args.clips:
        clip_num += 1

        if not run_countdown(cap, 3):
            break

        landmarks_buffer: list[list[float]] = []
        start_time = time.perf_counter()
        frame_count = 0
        no_face_count = 0

        while time.perf_counter() - start_time < args.duration:
            ok, frame = cap.read()
            if not ok:
                continue

            frame_count += 1
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            rgb.flags.writeable = False
            results = face_mesh.process(rgb)
            rgb.flags.writeable = True

            if results.multi_face_landmarks:
                lm_list = results.multi_face_landmarks[0]
                pts: list[float] = []
                for lm in lm_list.landmark:
                    pts.append(lm.x)
                    pts.append(lm.y)
                landmarks_buffer.append(pts)
                status_color = (0, 255, 0)
                status_text = "Face detected"
            else:
                no_face_count += 1
                status_color = (0, 0, 255)
                status_text = "No face"
                if args.label == "absent":
                    landmarks_buffer.append([0.0] * 936)

            elapsed = time.perf_counter() - start_time
            remaining = max(0.0, args.duration - elapsed)
            draw_overlay(frame, f"{remaining:.1f}s", status_color, 2.5)
            cv2.putText(frame, status_text, (20, 40),
                        cv2.FONT_HERSHEY_DUPLEX, 0.7, status_color, 1)
            cv2.putText(frame, f"Clip {clip_num} / {args.clips}", (20, 70),
                        cv2.FONT_HERSHEY_DUPLEX, 0.6, (200, 200, 200), 1)
            cv2.putText(frame, f"Frames captured: {len(landmarks_buffer)}", (20, 100),
                        cv2.FONT_HERSHEY_DUPLEX, 0.5, (180, 180, 180), 1)
            cv2.putText(frame, "ESC to abort", (20, 440),
                        cv2.FONT_HERSHEY_DUPLEX, 0.5, (100, 100, 100), 1)
            cv2.imshow("ProctorIQ — Collect Landmarks", frame)
            if cv2.waitKey(1) & 0xFF == 27:
                cap.release()
                cv2.destroyAllWindows()
                face_mesh.close()
                print("Aborted by user.")
                return

        if len(landmarks_buffer) < 15:
            print(f"Warning: Clip {clip_num} has only {len(landmarks_buffer)} frames (need >= 15). Skipping.")
            continue

        if no_face_count > max(1, frame_count // 2):
            print(f"Warning: Clip {clip_num} has {no_face_count}/{frame_count} frames without face. Quality may be poor.")

        clip_array = np.array(landmarks_buffer, dtype=np.float32)
        clip_path = output_dir / f"{args.label}_{start_index + collected + 1:03d}.npy"
        np.save(str(clip_path), clip_array)
        collected += 1
        print(f"Saved clip {collected}/{args.clips}: {clip_path} ({clip_array.shape[0]} frames)")

        cv2.putText(np.zeros((480, 640, 3), dtype=np.uint8),
                    f"Saved! ({collected}/{args.clips})", (120, 240),
                    cv2.FONT_HERSHEY_DUPLEX, 1.5, (0, 255, 0), 2)
        cv2.waitKey(800)

    cap.release()
    cv2.destroyAllWindows()
    face_mesh.close()
    print(f"Collection complete. {collected} clips saved to {output_dir.resolve()}")


if __name__ == "__main__":
    main()