"""initial schema — matches docs/DB_SCHEMA.md exactly

Revision ID: 0001
Revises:
Create Date: 2026-07-30

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute('CREATE EXTENSION IF NOT EXISTS "pgcrypto"')

    op.create_table(
        "users",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "runs",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", pg.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("brief", sa.Text(), nullable=False),
        sa.Column("autonomy_mode", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False, server_default="queued"),
        sa.Column("current_phase_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("plan", pg.JSONB(), nullable=True),
        sa.Column("last_seq", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "autonomy_mode IN ('draft_only','plan_then_run','just_run')", name="ck_runs_autonomy_mode"
        ),
        sa.CheckConstraint(
            "state IN ('queued','planning','awaiting_plan_approval','running',"
            "'degraded','stopping','stopped','failed','completed')",
            name="ck_runs_state",
        ),
    )
    op.create_index("idx_runs_user_id", "runs", ["user_id", sa.text("created_at DESC")])

    op.create_table(
        "run_events",
        sa.Column("run_id", pg.UUID(as_uuid=True), sa.ForeignKey("runs.id"), primary_key=True),
        sa.Column("seq", sa.BigInteger(), primary_key=True),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("scope_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("parent_scope_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("phase_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("type", sa.Text(), nullable=False),
        sa.Column("payload", pg.JSONB(), nullable=False, server_default="{}"),
    )
    op.create_index("idx_run_events_scope", "run_events", ["run_id", "scope_id"])
    op.create_index("idx_run_events_type", "run_events", ["run_id", "type"])

    op.create_table(
        "scopes",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", pg.UUID(as_uuid=True), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("parent_scope_id", pg.UUID(as_uuid=True), sa.ForeignKey("scopes.id"), nullable=True),
        sa.Column("agent_name", sa.Text(), nullable=False),
        sa.Column("phase_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("state", sa.Text(), nullable=False, server_default="spawned"),
        sa.Column("task_brief", pg.JSONB(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("checkpoint_path", sa.Text(), nullable=True),
        sa.Column("checkpoint_state", sa.Text(), nullable=False, server_default="none"),
        sa.Column("pid", sa.Integer(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "agent_name IN ('market_scout','seo_geo_analyst','community_scout',"
            "'x_scout','linkedin_scout','content_writer','influencer')",
            name="ck_scopes_agent_name",
        ),
        sa.CheckConstraint(
            "state IN ('spawned','running','awaiting_approval','completed','failed','stopped','orphaned')",
            name="ck_scopes_state",
        ),
        sa.CheckConstraint("checkpoint_state IN ('none','partial','complete')", name="ck_scopes_checkpoint_state"),
    )
    op.create_index("idx_scopes_run_id", "scopes", ["run_id"])
    op.create_index("idx_scopes_parent", "scopes", ["parent_scope_id"])
    op.create_index("idx_scopes_state", "scopes", ["run_id", "state"])

    op.create_table(
        "checkpoints",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", pg.UUID(as_uuid=True), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("seq", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("completed_phases", pg.JSONB(), nullable=False, server_default="[]"),
        sa.Column("findings", pg.JSONB(), nullable=False, server_default="{}"),
        sa.Column("partial_phase_state", pg.JSONB(), nullable=True),
        sa.Column("agent_memory", pg.JSONB(), nullable=True),
        sa.Column("summary_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("reason IN ('stop','phase_boundary','failure')", name="ck_checkpoints_reason"),
    )
    op.create_index("idx_checkpoints_run_id", "checkpoints", ["run_id", sa.text("created_at DESC")])

    op.create_table(
        "artifacts",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", pg.UUID(as_uuid=True), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("scope_id", pg.UUID(as_uuid=True), sa.ForeignKey("scopes.id"), nullable=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("format", sa.Text(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('strategy_doc','keyword_table','post_draft','outreach_list','influencer_list')",
            name="ck_artifacts_kind",
        ),
        sa.CheckConstraint("format IN ('markdown','csv','json')", name="ck_artifacts_format"),
    )
    op.create_index("idx_artifacts_run_id", "artifacts", ["run_id", sa.text("created_at DESC")])

    op.create_table(
        "approvals",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", pg.UUID(as_uuid=True), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("scope_id", pg.UUID(as_uuid=True), sa.ForeignKey("scopes.id"), nullable=True),
        sa.Column("action_type", sa.Text(), nullable=False),
        sa.Column("proposed_payload", pg.JSONB(), nullable=False),
        sa.Column("edited_payload", pg.JSONB(), nullable=True),
        sa.Column("preview", pg.JSONB(), nullable=True),
        sa.Column("state", sa.Text(), nullable=False, server_default="pending"),
        sa.Column("blocks_phase_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("requested_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("state IN ('pending','granted','denied','expired')", name="ck_approvals_state"),
    )
    op.create_index(
        "idx_approvals_pending", "approvals", ["run_id", "state"], postgresql_where=sa.text("state = 'pending'")
    )

    op.create_table(
        "queued_messages",
        sa.Column("id", pg.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("run_id", pg.UUID(as_uuid=True), sa.ForeignKey("runs.id"), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("state", sa.Text(), nullable=False, server_default="queued"),
        sa.Column("queued_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("deliver_after_phase_id", pg.UUID(as_uuid=True), nullable=True),
        sa.Column("delivered_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("state IN ('queued','delivered','cancelled')", name="ck_queued_messages_state"),
    )
    op.create_index("idx_queued_messages_run_id", "queued_messages", ["run_id", "state"])

    op.create_table(
        "tool_ledger",
        sa.Column("run_id", pg.UUID(as_uuid=True), sa.ForeignKey("runs.id"), primary_key=True),
        sa.Column("seq", sa.BigInteger(), primary_key=True),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("target", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("kind IN ('read','write','publish')", name="ck_tool_ledger_kind"),
    )
    op.create_index("idx_tool_ledger_run_id", "tool_ledger", ["run_id", "ts"])


def downgrade() -> None:
    op.drop_table("tool_ledger")
    op.drop_table("queued_messages")
    op.drop_table("approvals")
    op.drop_table("artifacts")
    op.drop_table("checkpoints")
    op.drop_table("scopes")
    op.drop_table("run_events")
    op.drop_table("runs")
    op.drop_table("users")
