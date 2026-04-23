from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import SandboxUser, require_auth
from app.routers import fpl

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="sutton5050-fpl", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.environ.get("CORS_ORIGIN", "http://localhost:5173"),
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(fpl.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ping")
async def ping(user: SandboxUser = Depends(require_auth)):
    now = datetime.now(timezone.utc).isoformat()
    logger.info(f">>> PING from user={user.email} at {now}")
    return {"message": "pong", "user": user.email, "timestamp": now}
