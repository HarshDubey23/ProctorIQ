from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class HostAccount(BaseModel):
    host_id: str
    host_token: str
    created_at: datetime
