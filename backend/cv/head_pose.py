from dataclasses import dataclass

import cv2
import numpy as np

MODEL_POINTS: np.ndarray = np.array(
    [
        (0.0, 0.0, 0.0),
        (0.0, -330.0, -65.0),
        (-225.0, 170.0, -135.0),
        (225.0, 170.0, -135.0),
        (-150.0, -150.0, -125.0),
        (150.0, -150.0, -125.0),
    ],
    dtype=np.float64,
)

LANDMARK_INDICES: list[int] = [1, 152, 33, 263, 61, 291]


@dataclass(frozen=True)
class HeadPoseResult:
    yaw: float
    pitch: float
    roll: float
    success: bool


def _build_camera_matrix(
    image_width: int, image_height: int, focal_length: float | None = None
) -> np.ndarray:
    if focal_length is None:
        focal_length = float(image_width)
    center_x = float(image_width) / 2.0
    center_y = float(image_height) / 2.0
    return np.array(
        [
            [focal_length, 0.0, center_x],
            [0.0, focal_length, center_y],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )


def _rotation_matrix_to_head_pose(R: np.ndarray) -> tuple[float, float, float]:
    forward = R[:, 2]
    yaw = float(np.degrees(np.arctan2(forward[0], -forward[2])))
    pitch = float(np.degrees(np.arctan2(-forward[1], -forward[2])))
    up = R[:, 1]
    roll = float(np.degrees(np.arctan2(-up[0], -up[1])))
    return yaw, pitch, roll


def estimate_head_pose(
    landmarks: np.ndarray,
    image_width: int = 640,
    image_height: int = 480,
    focal_length: float | None = None,
) -> HeadPoseResult:
    if landmarks.shape != (468, 2):
        raise ValueError(f"Expected landmarks shape (468, 2), got {landmarks.shape}")
    image_points = landmarks[LANDMARK_INDICES].astype(np.float64)
    camera_matrix = _build_camera_matrix(image_width, image_height, focal_length)
    dist_coeffs = np.zeros((4, 1), dtype=np.float64)
    success, rvec, _ = cv2.solvePnP(
        MODEL_POINTS, image_points, camera_matrix, dist_coeffs, flags=cv2.SOLVEPNP_ITERATIVE
    )
    if not success:
        return HeadPoseResult(yaw=0.0, pitch=0.0, roll=0.0, success=False)
    R, _ = cv2.Rodrigues(rvec)
    yaw, pitch, roll = _rotation_matrix_to_head_pose(R)
    return HeadPoseResult(yaw=yaw, pitch=pitch, roll=roll, success=True)
