from __future__ import annotations

import pytest

from backend.core.config import Settings


def test_production_rejects_default_report_signing_secret() -> None:
    with pytest.raises(RuntimeError, match="REPORT_SIGNING_SECRET"):
        Settings(environment="production")
