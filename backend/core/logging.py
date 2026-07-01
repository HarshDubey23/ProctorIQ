from __future__ import annotations

import sys

from loguru import logger


def setup_logging() -> None:
    logger.remove()
    logger.add(
        sys.stdout,
        format=(
            "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level:<7} | {name}:{function}:{line} | {message}"
            " | {extra[method]} | {extra[path]} | {extra[status]} | {extra[duration_ms]}"
        ),
        serialize=False,
        colorize=True,
        level="INFO",
    )
    logger.configure(extra={"method": "-", "path": "-", "status": "-", "duration_ms": "-"})
