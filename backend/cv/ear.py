from dataclasses import dataclass

import numpy as np

LEFT_EYE_INDICES: list[int] = [33, 159, 158, 133, 153, 145]
RIGHT_EYE_INDICES: list[int] = [362, 386, 385, 263, 374, 380]


@dataclass(frozen=True)
class EarResult:
    left: float
    right: float
    mean: float


def _euclidean(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def eye_aspect_ratio(landmarks: np.ndarray, eye_indices: list[int]) -> float:
    if landmarks.shape != (468, 2):
        raise ValueError(f"Expected landmarks shape (468, 2), got {landmarks.shape}")
    p1 = landmarks[eye_indices[0]]
    p2 = landmarks[eye_indices[1]]
    p3 = landmarks[eye_indices[2]]
    p4 = landmarks[eye_indices[3]]
    p5 = landmarks[eye_indices[4]]
    p6 = landmarks[eye_indices[5]]
    vertical_1 = _euclidean(p2, p6)
    vertical_2 = _euclidean(p3, p5)
    horizontal = _euclidean(p1, p4)
    if horizontal < 1e-8:
        return 0.0
    return (vertical_1 + vertical_2) / (2.0 * horizontal)


def compute_ear(landmarks: np.ndarray) -> EarResult:
    left_ear = eye_aspect_ratio(landmarks, LEFT_EYE_INDICES)
    right_ear = eye_aspect_ratio(landmarks, RIGHT_EYE_INDICES)
    mean_ear = (left_ear + right_ear) / 2.0
    return EarResult(left=left_ear, right=right_ear, mean=mean_ear)
