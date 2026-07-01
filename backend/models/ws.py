from __future__ import annotations

from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, RootModel


class WsFlagEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: Literal["flag"] = "flag"
    event_type: str
    timestamp_s: float
    confidence: float | None = None
    details: dict[str, Any] | None = None


class WsStateEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: Literal["state"] = "state"
    attention_state: str
    ear: float
    head_pose: dict[str, float]
    face_count: int


class WsBenchmarkEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: Literal["benchmark"] = "benchmark"
    model_latency_ms: float
    inference_count: int
    pca_latency_ms: float


class WsHeartbeatEvent(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: Literal["heartbeat"] = "heartbeat"


WsInboundEvent = Annotated[
    Union[
        WsFlagEvent,
        WsStateEvent,
        WsBenchmarkEvent,
        WsHeartbeatEvent,
    ],
    Field(discriminator="type"),
]


class WsInboundMessage(RootModel[WsInboundEvent]):
    pass


class WsOutboundTick(BaseModel):
    model_config = ConfigDict(frozen=True)

    type: Literal["tick"] = "tick"
    session_id: str
    timestamp_s: float
    attention_state: str
    ear: float
    head_pose: dict[str, float]
    face_count: int
    events_since_tick: list[dict[str, Any]]
    running_score: float
    room_id: str | None = None
    display_name: str | None = None
