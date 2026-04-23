from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth import SandboxUser, require_auth
from app.models.session import SessionCreate, SessionList, SessionResponse
from app.services.dynamo import delete_session, get_session, list_sessions, put_session

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create(
    body: SessionCreate,
    request: Request,
    user: SandboxUser = Depends(require_auth),
):
    item = put_session(request.app.state.table, user.sub, body.metadata)
    return SessionResponse(
        session_id=item["session_id"],
        user_id=item["user_id"],
        created_at=item["created_at"],
        metadata=item["metadata"],
    )


@router.get("/", response_model=SessionList)
async def list_all(
    request: Request,
    user: SandboxUser = Depends(require_auth),
):
    items = list_sessions(request.app.state.table, user.sub)
    sessions = [
        SessionResponse(
            session_id=i["session_id"],
            user_id=i["user_id"],
            created_at=i["created_at"],
            metadata=i.get("metadata", {}),
        )
        for i in items
    ]
    return SessionList(sessions=sessions)


@router.get("/{session_id}", response_model=SessionResponse)
async def get_one(
    session_id: str,
    request: Request,
    user: SandboxUser = Depends(require_auth),
):
    item = get_session(request.app.state.table, user.sub, session_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return SessionResponse(
        session_id=item["session_id"],
        user_id=item["user_id"],
        created_at=item["created_at"],
        metadata=item.get("metadata", {}),
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete(
    session_id: str,
    request: Request,
    user: SandboxUser = Depends(require_auth),
):
    delete_session(request.app.state.table, user.sub, session_id)
