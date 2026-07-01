from __future__ import annotations

import numpy as np
import pytest


@pytest.fixture
def sample_landmarks_open_eyes() -> np.ndarray:
    rng = np.random.RandomState(42)
    landmarks = rng.rand(468, 2).astype(np.float64) * 640.0
    left_eye_outer = np.array([200.0, 240.0])
    left_eye_upper_outer = np.array([210.0, 228.0])
    left_eye_upper_inner = np.array([230.0, 228.0])
    left_eye_inner = np.array([240.0, 240.0])
    left_eye_lower_inner = np.array([230.0, 252.0])
    left_eye_lower_outer = np.array([210.0, 252.0])
    landmarks[33] = left_eye_outer
    landmarks[159] = left_eye_upper_outer
    landmarks[158] = left_eye_upper_inner
    landmarks[133] = left_eye_inner
    landmarks[153] = left_eye_lower_inner
    landmarks[145] = left_eye_lower_outer
    right_eye_outer = np.array([400.0, 240.0])
    right_eye_upper_outer = np.array([410.0, 228.0])
    right_eye_upper_inner = np.array([430.0, 228.0])
    right_eye_inner = np.array([440.0, 240.0])
    right_eye_lower_inner = np.array([430.0, 252.0])
    right_eye_lower_outer = np.array([410.0, 252.0])
    landmarks[362] = right_eye_outer
    landmarks[386] = right_eye_upper_outer
    landmarks[385] = right_eye_upper_inner
    landmarks[263] = right_eye_inner
    landmarks[374] = right_eye_lower_inner
    landmarks[380] = right_eye_lower_outer
    return landmarks


@pytest.fixture
def sample_landmarks_closed_eyes() -> np.ndarray:
    rng = np.random.RandomState(42)
    landmarks = rng.rand(468, 2).astype(np.float64) * 640.0
    left_eye_outer = np.array([200.0, 240.0])
    left_eye_upper_outer = np.array([210.0, 239.0])
    left_eye_upper_inner = np.array([230.0, 239.0])
    left_eye_inner = np.array([240.0, 240.0])
    left_eye_lower_inner = np.array([230.0, 241.0])
    left_eye_lower_outer = np.array([210.0, 241.0])
    landmarks[33] = left_eye_outer
    landmarks[159] = left_eye_upper_outer
    landmarks[158] = left_eye_upper_inner
    landmarks[133] = left_eye_inner
    landmarks[153] = left_eye_lower_inner
    landmarks[145] = left_eye_lower_outer
    right_eye_outer = np.array([400.0, 240.0])
    right_eye_upper_outer = np.array([410.0, 239.0])
    right_eye_upper_inner = np.array([430.0, 239.0])
    right_eye_inner = np.array([440.0, 240.0])
    right_eye_lower_inner = np.array([430.0, 241.0])
    right_eye_lower_outer = np.array([410.0, 241.0])
    landmarks[362] = right_eye_outer
    landmarks[386] = right_eye_upper_outer
    landmarks[385] = right_eye_upper_inner
    landmarks[263] = right_eye_inner
    landmarks[374] = right_eye_lower_inner
    landmarks[380] = right_eye_lower_outer
    return landmarks


@pytest.fixture
def sample_pose_landmarks_forward() -> np.ndarray:
    rng = np.random.RandomState(42)
    landmarks = rng.rand(468, 2).astype(np.float64) * 640.0
    landmarks[1] = np.array([320.0, 280.0])
    landmarks[152] = np.array([320.0, 420.0])
    landmarks[33] = np.array([200.0, 240.0])
    landmarks[263] = np.array([440.0, 240.0])
    landmarks[61] = np.array([260.0, 355.0])
    landmarks[291] = np.array([380.0, 355.0])
    return landmarks


@pytest.fixture
def sample_pose_landmarks_turned() -> np.ndarray:
    rng = np.random.RandomState(42)
    landmarks = rng.rand(468, 2).astype(np.float64) * 640.0
    landmarks[1] = np.array([260.0, 280.0])
    landmarks[152] = np.array([270.0, 420.0])
    landmarks[33] = np.array([160.0, 235.0])
    landmarks[263] = np.array([360.0, 250.0])
    landmarks[61] = np.array([220.0, 350.0])
    landmarks[291] = np.array([330.0, 360.0])
    return landmarks
