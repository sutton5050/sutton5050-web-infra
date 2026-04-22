from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    metadata: dict = Field(default_factory=dict)


class SessionResponse(BaseModel):
    session_id: str
    user_id: str
    created_at: str
    metadata: dict = Field(default_factory=dict)


class SessionList(BaseModel):
    sessions: list[SessionResponse]
