from __future__ import annotations

from io import BytesIO
from typing import Any, cast

from PIL import Image, ImageDraw


EVENT_COLORS: dict[str, tuple[int, int, int]] = {
    "focused": (52, 211, 153),
    "distracted": (251, 146, 60),
    "absent": (167, 139, 250),
    "drowsy": (52, 211, 153),
    "multi": (244, 114, 182),
    "tab_switch": (252, 211, 77),
    "default": (100, 116, 139),
}

TIMELINE_WIDTH = 1200
TIMELINE_HEIGHT = 48
MAX_DURATION = 600


def _event_color(event_type: str) -> tuple[int, int, int]:
    return EVENT_COLORS.get(event_type, EVENT_COLORS["default"])


def generate_timeline_image(
    duration_sec: int,
    events: list[dict[str, Any]],
) -> bytes:
    clamped = min(duration_sec, MAX_DURATION)
    rect_w = max(2, TIMELINE_WIDTH // clamped) if clamped > 0 else TIMELINE_WIDTH

    img = Image.new("RGBA", (TIMELINE_WIDTH, TIMELINE_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    def second_to_attention(second: int) -> str:
        for ev in events:
            if int(ev.get("timestamp_s", 0)) == second:
                return cast(str, ev.get("event_type", "focused"))
        return "focused"

    for i in range(clamped):
        attention = second_to_attention(i)
        color = _event_color(attention)
        x = i * rect_w
        draw.rectangle(
            [x, 0, x + max(1, rect_w - 1), TIMELINE_HEIGHT],
            fill=(*color, 102),
        )

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
