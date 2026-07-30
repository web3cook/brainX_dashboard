import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.orchestrator.event_bus import event_bus
from app.routers import approvals, artifacts, bootstrap, ledger, runs, ws

# Uvicorn only configures its own "uvicorn.*" loggers by default, without
# this, every `logger.info(...)` in app.* modules (run lifecycle, agent
# spawns) silently goes nowhere below WARNING. This makes `docker compose
# logs api` show the full story for every run.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await event_bus.start()
    try:
        yield
    finally:
        await event_bus.stop()


app = FastAPI(title="brainX harness API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(bootstrap.router)
app.include_router(runs.router)
app.include_router(approvals.router)
app.include_router(artifacts.router)
app.include_router(ledger.router)
app.include_router(ws.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
