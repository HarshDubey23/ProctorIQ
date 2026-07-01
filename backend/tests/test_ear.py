from __future__ import annotations

import numpy as np
import pytest

from backend.cv.ear import LEFT_EYE_INDICES, RIGHT_EYE_INDICES, compute_ear, eye_aspect_ratio


class TestEyeAspectRatio:
    def test_open_eyes_returns_expected_ear(self, sample_landmarks_open_eyes: np.ndarray) -> None:
        left_ear = eye_aspect_ratio(sample_landmarks_open_eyes, LEFT_EYE_INDICES)
        right_ear = eye_aspect_ratio(sample_landmarks_open_eyes, RIGHT_EYE_INDICES)
        assert left_ear == pytest.approx(0.6, abs=0.01)
        assert right_ear == pytest.approx(0.6, abs=0.01)

    def test_closed_eyes_returns_low_ear(self, sample_landmarks_closed_eyes: np.ndarray) -> None:
        left_ear = eye_aspect_ratio(sample_landmarks_closed_eyes, LEFT_EYE_INDICES)
        assert left_ear == pytest.approx(0.05, abs=0.01)

    def test_compute_ear_returns_mean(self, sample_landmarks_open_eyes: np.ndarray) -> None:
        result = compute_ear(sample_landmarks_open_eyes)
        expected_mean = (result.left + result.right) / 2.0
        assert result.mean == pytest.approx(expected_mean)

    def test_zero_horizontal_distance(self) -> None:
        landmarks = np.zeros((468, 2), dtype=np.float64)
        ear = eye_aspect_ratio(landmarks, LEFT_EYE_INDICES)
        assert ear == 0.0

    def test_wrong_shape_raises(self) -> None:
        with pytest.raises(ValueError, match="Expected landmarks shape"):
            eye_aspect_ratio(np.zeros((100, 2)), LEFT_EYE_INDICES)

    def test_compute_ear_wrong_shape_raises(self) -> None:
        with pytest.raises(ValueError, match="Expected landmarks shape"):
            compute_ear(np.zeros((100, 2)))

    def test_open_eyes_both_eyes_similar(self, sample_landmarks_open_eyes: np.ndarray) -> None:
        result = compute_ear(sample_landmarks_open_eyes)
        assert abs(result.left - result.right) < 0.01

    def test_ear_with_known_coordinates(self) -> None:
        landmarks = np.zeros((468, 2), dtype=np.float64)
        landmarks[33] = [0.0, 0.0]
        landmarks[159] = [5.0, -10.0]
        landmarks[158] = [15.0, -10.0]
        landmarks[133] = [20.0, 0.0]
        landmarks[153] = [15.0, 10.0]
        landmarks[145] = [5.0, 10.0]
        v1 = np.linalg.norm(np.array([5.0, -10.0]) - np.array([5.0, 10.0]))
        v2 = np.linalg.norm(np.array([15.0, -10.0]) - np.array([15.0, 10.0]))
        h = np.linalg.norm(np.array([0.0, 0.0]) - np.array([20.0, 0.0]))
        expected = (v1 + v2) / (2.0 * h)
        ear = eye_aspect_ratio(landmarks, LEFT_EYE_INDICES)
        assert ear == pytest.approx(expected)

    def test_ear_right_eye_known_coordinates(self) -> None:
        landmarks = np.zeros((468, 2), dtype=np.float64)
        landmarks[362] = [0.0, 0.0]
        landmarks[386] = [5.0, -10.0]
        landmarks[385] = [15.0, -10.0]
        landmarks[263] = [20.0, 0.0]
        landmarks[374] = [15.0, 10.0]
        landmarks[380] = [5.0, 10.0]
        v1 = np.linalg.norm(np.array([5.0, -10.0]) - np.array([5.0, 10.0]))
        v2 = np.linalg.norm(np.array([15.0, -10.0]) - np.array([15.0, 10.0]))
        h = np.linalg.norm(np.array([0.0, 0.0]) - np.array([20.0, 0.0]))
        expected = (v1 + v2) / (2.0 * h)
        ear = eye_aspect_ratio(landmarks, RIGHT_EYE_INDICES)
        assert ear == pytest.approx(expected)
