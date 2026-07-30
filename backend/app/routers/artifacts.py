import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import Artifact
from app.schemas import ArtifactOut, ArtifactsResponse

router = APIRouter(tags=["artifacts"])

_CONTENT_TYPES = {"markdown": "text/markdown", "csv": "text/csv", "json": "application/json"}


@router.get("/runs/{run_id}/artifacts", response_model=ArtifactsResponse)
async def list_artifacts(
    run_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> ArtifactsResponse:
    rows = (
        (
            await session.execute(
                select(Artifact)
                .where(Artifact.run_id == run_id)
                .order_by(Artifact.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return ArtifactsResponse(
        artifacts=[
            ArtifactOut(
                id=a.id,
                kind=a.kind,
                title=a.title,
                format=a.format,
                version=a.version,
                created_at=a.created_at,
            )
            for a in rows
        ]
    )


@router.get("/artifacts/{artifact_id}/download")
async def download_artifact(
    artifact_id: uuid.UUID, session: AsyncSession = Depends(get_session)
) -> Response:
    artifact = await session.get(Artifact, artifact_id)
    if artifact is None:
        raise HTTPException(status_code=404, detail="artifact not found")

    ext = {"markdown": "md", "csv": "csv", "json": "json"}[artifact.format]
    filename = f"{artifact.title.replace(' ', '_')}.{ext}"
    return Response(
        content=artifact.content,
        media_type=_CONTENT_TYPES[artifact.format],
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
