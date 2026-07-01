from __future__ import annotations

import pytest

from backend.cv.scoring import (
    ConcernLevel,
    FlagEvent,
    compute_attention_score,
)


class TestAttentionScore:
    def test_empty_session_returns_low_concern(self) -> None:
        result = compute_attention_score([], duration_s=10.0)
        assert result.score == 0.0
        assert result.concern == ConcernLevel.LOW
        assert result.duration_s == 10.0

    def test_no_events_returns_zero_score(self) -> None:
        result = compute_attention_score([], duration_s=30.0)
        assert result.score == 0.0
        assert result.total_penalty == 0.0

    def test_single_distracted_event(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=5.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.1)
        assert result.concern == ConcernLevel.LOW
        assert result.event_counts["distracted"] == 1

    def test_single_absent_event(self) -> None:
        events = [FlagEvent(event_type="absent", timestamp_s=2.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.2)
        assert result.concern == ConcernLevel.LOW

    def test_single_drowsy_event(self) -> None:
        events = [FlagEvent(event_type="drowsy", timestamp_s=3.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.1)

    def test_single_multi_face_event(self) -> None:
        events = [FlagEvent(event_type="multi_face", timestamp_s=4.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.3)

    def test_single_tab_switch_event(self) -> None:
        events = [FlagEvent(event_type="tab_switch", timestamp_s=6.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.2)

    def test_multiple_distractions_same_second_accumulate(self) -> None:
        events = [
            FlagEvent(event_type="distracted", timestamp_s=5.0),
            FlagEvent(event_type="distracted", timestamp_s=5.0),
            FlagEvent(event_type="distracted", timestamp_s=5.0),
        ]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.3)

    def test_mixed_event_types(self) -> None:
        events = [
            FlagEvent(event_type="distracted", timestamp_s=1.0),
            FlagEvent(event_type="absent", timestamp_s=2.0),
            FlagEvent(event_type="drowsy", timestamp_s=3.0),
        ]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.4)

    def test_all_event_types_in_one_second(self) -> None:
        events = [
            FlagEvent(event_type="distracted", timestamp_s=5.0),
            FlagEvent(event_type="absent", timestamp_s=5.0),
            FlagEvent(event_type="drowsy", timestamp_s=5.0),
            FlagEvent(event_type="multi_face", timestamp_s=5.0),
            FlagEvent(event_type="tab_switch", timestamp_s=5.0),
        ]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.9)

    def test_event_at_start_time(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=0.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.1)

    def test_event_at_end_time_boundary_excluded(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=10.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(0.0)
        assert len(result.event_counts) == 0

    def test_event_at_end_time_inclusive(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=9.999)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.1)
        assert result.event_counts["distracted"] == 1

    def test_event_before_start_ignored(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=-1.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == 0.0

    def test_zero_duration_returns_zero(self) -> None:
        result = compute_attention_score([], duration_s=0.0)
        assert result.score == 0.0
        assert result.concern == ConcernLevel.LOW

    def test_negative_duration_returns_zero(self) -> None:
        result = compute_attention_score([], duration_s=-5.0)
        assert result.score == 0.0
        assert result.concern == ConcernLevel.LOW

    def test_one_second_session(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=0.0)]
        result = compute_attention_score(events, duration_s=1.0)
        assert result.score == pytest.approx(-1.0)

    def test_high_concern_threshold(self) -> None:
        events = [FlagEvent(event_type="multi_face", timestamp_s=0.0)]
        result = compute_attention_score(events, duration_s=1.0)
        assert result.score == pytest.approx(-3.0)
        assert result.concern == ConcernLevel.HIGH

    def test_medium_concern_at_upper_boundary(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=0.0)]
        result = compute_attention_score(events, duration_s=2.0)
        assert result.score == pytest.approx(-0.5)
        assert result.concern == ConcernLevel.MEDIUM

    def test_low_concern_just_above_threshold(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=0.0)]
        result = compute_attention_score(events, duration_s=3.0)
        assert result.score == pytest.approx(-1.0 / 3.0)
        assert result.score > -0.5
        assert result.concern == ConcernLevel.LOW

    def test_every_second_distracted_ten_seconds(self) -> None:
        events = [
            FlagEvent(event_type="distracted", timestamp_s=float(i))
            for i in range(10)
        ]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-1.0)
        assert result.concern == ConcernLevel.MEDIUM

    def test_half_seconds_distracted(self) -> None:
        events = [
            FlagEvent(event_type="distracted", timestamp_s=float(i))
            for i in range(5)
        ]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.5)
        assert result.concern == ConcernLevel.MEDIUM

    def test_large_session_with_sparse_events(self) -> None:
        events = [FlagEvent(event_type="distracted", timestamp_s=50.0)]
        result = compute_attention_score(events, duration_s=100.0)
        assert result.score == pytest.approx(-0.01)
        assert result.concern == ConcernLevel.LOW

    def test_event_counts_track_all_types(self) -> None:
        events = [
            FlagEvent(event_type="distracted", timestamp_s=1.0),
            FlagEvent(event_type="absent", timestamp_s=2.0),
            FlagEvent(event_type="absent", timestamp_s=3.0),
            FlagEvent(event_type="multi_face", timestamp_s=4.0),
        ]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.event_counts["distracted"] == 1
        assert result.event_counts["absent"] == 2
        assert result.event_counts["multi_face"] == 1
        assert "drowsy" not in result.event_counts
        assert "tab_switch" not in result.event_counts

    def test_tab_switch_reduces_score_and_appears_in_report(self) -> None:
        events = [FlagEvent(event_type="tab_switch", timestamp_s=5.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.2)
        assert result.event_counts["tab_switch"] == 1

    def test_window_blur_reduces_score_and_appears_in_report(self) -> None:
        events = [FlagEvent(event_type="window_blur", timestamp_s=5.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == pytest.approx(-0.1)
        assert result.event_counts["window_blur"] == 1

    def test_unknown_event_type_ignored(self) -> None:
        events = [FlagEvent(event_type="unknown_type", timestamp_s=5.0)]
        result = compute_attention_score(events, duration_s=10.0)
        assert result.score == 0.0
        assert len(result.event_counts) == 0
