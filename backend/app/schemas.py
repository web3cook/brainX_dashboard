"""Request/response models for the REST surface — matches docs/API.md."""

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from app.planner.schemas import Plan

AutonomyMode = Literal["draft_only", "plan_then_run", "just_run"]


class BootstrapRequest(BaseModel):
    email: str
    name: str | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    name: str | None


class RunSummary(BaseModel):
    id: uuid.UUID
    title: str
    state: str
    created_at: datetime


class BootstrapResponse(BaseModel):
    user: UserOut
    runs: list[RunSummary]


class RunCreateRequest(BaseModel):
    title: str
    brief: str
    autonomy_mode: AutonomyMode


class RunOut(BaseModel):
    id: uuid.UUID
    title: str
    state: str
    autonomy_mode: str
    current_phase_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class RunCreateResponse(BaseModel):
    run: RunOut
    plan: Plan


class RunListResponse(BaseModel):
    runs: list[RunSummary]


class RunDetailResponse(BaseModel):
    run: RunOut
    plan: Plan | None


class EventOut(BaseModel):
    run_id: uuid.UUID
    seq: int
    ts: datetime
    scope_id: uuid.UUID | None
    parent_scope_id: uuid.UUID | None
    phase_id: uuid.UUID | None
    type: str
    payload: dict[str, Any]


class EventsResponse(BaseModel):
    events: list[EventOut]


class PlanApproveRequest(BaseModel):
    edited_plan: Plan | None = None


class PlanRejectRequest(BaseModel):
    note: str


class ResumeRequest(BaseModel):
    redirect: str | None = None


class MessageCreateRequest(BaseModel):
    body: str


class MessageOut(BaseModel):
    id: uuid.UUID
    state: str
    deliver_after_phase_id: uuid.UUID | None


class AutonomyPatchRequest(BaseModel):
    autonomy_mode: AutonomyMode


class ApprovalGrantRequest(BaseModel):
    edited_payload: dict[str, Any] | None = None


class ApprovalDenyRequest(BaseModel):
    reason: str


class ApprovalOut(BaseModel):
    id: uuid.UUID
    state: str


class ArtifactOut(BaseModel):
    id: uuid.UUID
    kind: str
    title: str
    format: str
    version: int
    created_at: datetime


class ArtifactsResponse(BaseModel):
    artifacts: list[ArtifactOut]


class LedgerRow(BaseModel):
    seq: int
    kind: str
    target: str
    summary: str
    ts: datetime


class LedgerResponse(BaseModel):
    ledger: list[LedgerRow]
