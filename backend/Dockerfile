# Build context is the REPO ROOT (see docker-compose.yml: `context: .`), not
# this directory, because the image needs both `backend/` and the sibling
# `agents/` package baked in, the orchestrator spawns
# `python -m agents.runner ...` as a subprocess of this same container, so
# `agents/` must sit at /app/agents, importable via the container's cwd.
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .
COPY agents/ ./agents/

EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
