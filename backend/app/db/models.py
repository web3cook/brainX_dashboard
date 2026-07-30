"""SQLAlchemy models, mirrors docs/DB_SCHEMA.md exactly. That document is the
source of truth; if the two ever disagree, the doc wins and this file is wrong.

Every datetime column is explicitly `DateTime(timezone=True)` to match the
`timestamptz` columns the Alembic migration actually creates, leaving it
implicit defaults to naive `DateTime`, which asyncpg rejects the moment the
app binds a tz-aware Python `datetime` against it.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

TZ = DateTime(timezone=True)


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, server_default=func.gen_random_uuid())


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = _uuid_pk()
    email: Mapped[str] = mapped_column(unique=True, nullable=False)
    name: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (
        CheckConstraint(
            "autonomy_mode IN ('draft_only','plan_then_run','just_run')",
            name="ck_runs_autonomy_mode",
        ),
        CheckConstraint(
            "state IN ('queued','planning','awaiting_plan_approval','running',"
            "'degraded','stopping','stopped','failed','completed')",
            name="ck_runs_state",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(nullable=False)
    brief: Mapped[str] = mapped_column(nullable=False)
    autonomy_mode: Mapped[str] = mapped_column(nullable=False)
    state: Mapped[str] = mapped_column(nullable=False, server_default="queued")
    current_phase_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    plan: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    last_seq: Mapped[int] = mapped_column(BigInteger, nullable=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(TZ, nullable=True)


class RunEvent(Base):
    __tablename__ = "run_events"

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("runs.id"), primary_key=True)
    seq: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ts: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    parent_scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    phase_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    type: Mapped[str] = mapped_column(nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")


class Scope(Base):
    __tablename__ = "scopes"
    __table_args__ = (
        CheckConstraint(
            "agent_name IN ('market_scout','seo_geo_analyst','community_scout',"
            "'x_scout','linkedin_scout','content_writer','influencer')",
            name="ck_scopes_agent_name",
        ),
        CheckConstraint(
            "state IN ('spawned','running','awaiting_approval','completed',"
            "'failed','stopped','orphaned')",
            name="ck_scopes_state",
        ),
        CheckConstraint(
            "checkpoint_state IN ('none','partial','complete')",
            name="ck_scopes_checkpoint_state",
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("runs.id"), nullable=False)
    parent_scope_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("scopes.id"), nullable=True
    )
    agent_name: Mapped[str] = mapped_column(nullable=False)
    phase_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    state: Mapped[str] = mapped_column(nullable=False, server_default="spawned")
    task_brief: Mapped[dict] = mapped_column(JSONB, nullable=False)
    summary: Mapped[str | None] = mapped_column(nullable=True)
    checkpoint_path: Mapped[str | None] = mapped_column(nullable=True)
    checkpoint_state: Mapped[str] = mapped_column(nullable=False, server_default="none")
    pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    started_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    ended_at: Mapped[datetime | None] = mapped_column(TZ, nullable=True)


class Checkpoint(Base):
    __tablename__ = "checkpoints"
    __table_args__ = (
        CheckConstraint(
            "reason IN ('stop','phase_boundary','failure')", name="ck_checkpoints_reason"
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("runs.id"), nullable=False)
    seq: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reason: Mapped[str] = mapped_column(nullable=False)
    completed_phases: Mapped[list] = mapped_column(JSONB, nullable=False, server_default="[]")
    findings: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    partial_phase_state: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    agent_memory: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    summary_text: Mapped[str | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Artifact(Base):
    __tablename__ = "artifacts"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('strategy_doc','keyword_table','post_draft','outreach_list','influencer_list')",
            name="ck_artifacts_kind",
        ),
        CheckConstraint("format IN ('markdown','csv','json')", name="ck_artifacts_format"),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("runs.id"), nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("scopes.id"), nullable=True)
    kind: Mapped[str] = mapped_column(nullable=False)
    title: Mapped[str] = mapped_column(nullable=False)
    format: Mapped[str] = mapped_column(nullable=False)
    content: Mapped[str] = mapped_column(nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())


class Approval(Base):
    __tablename__ = "approvals"
    __table_args__ = (
        CheckConstraint(
            "state IN ('pending','granted','denied','expired')", name="ck_approvals_state"
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("runs.id"), nullable=False)
    scope_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("scopes.id"), nullable=True)
    action_type: Mapped[str] = mapped_column(nullable=False)
    proposed_payload: Mapped[dict] = mapped_column(JSONB, nullable=False)
    edited_payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    preview: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    state: Mapped[str] = mapped_column(nullable=False, server_default="pending")
    blocks_phase_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    requested_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(TZ, nullable=True)


class QueuedMessage(Base):
    __tablename__ = "queued_messages"
    __table_args__ = (
        CheckConstraint(
            "state IN ('queued','delivered','cancelled')", name="ck_queued_messages_state"
        ),
    )

    id: Mapped[uuid.UUID] = _uuid_pk()
    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("runs.id"), nullable=False)
    body: Mapped[str] = mapped_column(nullable=False)
    state: Mapped[str] = mapped_column(nullable=False, server_default="queued")
    queued_at: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
    deliver_after_phase_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    delivered_at: Mapped[datetime | None] = mapped_column(TZ, nullable=True)


class ToolLedger(Base):
    __tablename__ = "tool_ledger"
    __table_args__ = (
        CheckConstraint("kind IN ('read','write','publish')", name="ck_tool_ledger_kind"),
    )

    run_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("runs.id"), primary_key=True)
    seq: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    kind: Mapped[str] = mapped_column(nullable=False)
    target: Mapped[str] = mapped_column(nullable=False)
    summary: Mapped[str] = mapped_column(nullable=False)
    ts: Mapped[datetime] = mapped_column(TZ, server_default=func.now())
