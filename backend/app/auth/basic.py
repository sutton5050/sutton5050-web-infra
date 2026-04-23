import os
import secrets
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from pydantic import BaseModel

# Shared-secret Basic Auth. All non-public routes depend on `require_auth`.
# Username/password come from env vars populated by the ECS task definition.

security = HTTPBasic()

# Stable sandbox identity stored on DynamoDB records. Everyone authenticated
# as the sandbox user shares this ID so existing rows remain queryable.
SANDBOX_USER_ID = "sandbox-user"


class SandboxUser(BaseModel):
    sub: str
    email: str


def require_auth(
    credentials: Annotated[HTTPBasicCredentials, Depends(security)],
) -> SandboxUser:
    expected_user = os.environ.get("SANDBOX_USERNAME", "sandbox")
    expected_pass = os.environ.get("SANDBOX_PASSWORD", "")
    if not expected_pass:
        # Fail closed: misconfigured deployment shouldn't silently allow access.
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Auth not configured")

    # constant-time comparison to blunt timing attacks
    user_ok = secrets.compare_digest(credentials.username.encode(), expected_user.encode())
    pass_ok = secrets.compare_digest(credentials.password.encode(), expected_pass.encode())
    if not (user_ok and pass_ok):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )

    return SandboxUser(sub=SANDBOX_USER_ID, email=f"{expected_user}@sandbox")
