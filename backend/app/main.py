from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
import os

import boto3
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import CognitoUser, get_current_user
from app.routers import sessions

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    region = os.environ.get("AWS_DEFAULT_REGION", "eu-west-2")
    dynamodb = boto3.resource("dynamodb", region_name=region)
    app.state.table = dynamodb.Table(os.environ.get("DYNAMODB_TABLE_NAME", "sutton5050-app"))
    app.state.s3 = boto3.client("s3", region_name=region)
    app.state.bucket_name = os.environ.get("S3_BUCKET_NAME", "")
    yield


app = FastAPI(title="sutton5050-sandbox", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.environ.get("CORS_ORIGIN", "http://localhost:5173"),
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(sessions.router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ping")
async def ping(user: CognitoUser = Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    logger.info(f">>> PING from user={user.email} sub={user.sub} at {now}")
    return {
        "message": "pong",
        "user": user.email,
        "timestamp": now,
    }
