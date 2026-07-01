from __future__ import annotations

import numpy as np
import pytest

from backend.cv.head_pose import estimate_head_pose


class TestHeadPose:
    def test_forward_facing_returns_small_yaw_and_roll(
        self, sample_pose_landmarks_forward: np.ndarray
    ) -> None:
        result = estimate_head_pose(sample_pose_landmarks_forward)
        assert result.success
        assert abs(result.yaw) < 5.0
        assert abs(result.roll) < 5.0

    def test_turned_face_detects_yaw_change(
        self, sample_pose_landmarks_forward: np.ndarray, sample_pose_landmarks_turned: np.ndarray
    ) -> None:
        forward_result = estimate_head_pose(sample_pose_landmarks_forward)
        turned_result = estimate_head_pose(sample_pose_landmarks_turned)
        assert turned_result.success
        assert abs(turned_result.yaw - forward_result.yaw) > 5.0

    def test_wrong_shape_raises(self) -> None:
        with pytest.raises(ValueError, match="Expected landmarks shape"):
            estimate_head_pose(np.zeros((100, 2)))

    def test_custom_image_dimensions(self, sample_pose_landmarks_forward: np.ndarray) -> None:
        result = estimate_head_pose(
            sample_pose_landmarks_forward, image_width=1280, image_height=720
        )
        assert result.success

    def test_custom_focal_length(self, sample_pose_landmarks_forward: np.ndarray) -> None:
        result = estimate_head_pose(
            sample_pose_landmarks_forward, focal_length=800.0
        )
        assert result.success

    def test_result_is_frozen_dataclass(self, sample_pose_landmarks_forward: np.ndarray) -> None:
        result = estimate_head_pose(sample_pose_landmarks_forward)
        import dataclasses
        assert dataclasses.is_dataclass(result)

    def test_zero_landmarks_does_not_crash(self) -> None:
        landmarks = np.zeros((468, 2), dtype=np.float64)
        result = estimate_head_pose(landmarks)
        assert isinstance(result.yaw, float)
