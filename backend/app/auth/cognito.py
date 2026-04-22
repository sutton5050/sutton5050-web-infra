import os
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

security = HTTPBearer()

_jwks_cache: Optional[dict] = None


class CognitoUser(BaseModel):
    sub: str
    email: str
    groups: list[str] = []


def _get_jwks_url() -> str:
    region = os.environ.get("COGNITO_REGION", "eu-west-2")
    pool_id = os.environ.get("COGNITO_USER_POOL_ID", "")
    return f"https://cognito-idp.{region}.amazonaws.com/{pool_id}/.well-known/jwks.json"


def _get_issuer() -> str:
    region = os.environ.get("COGNITO_REGION", "eu-west-2")
    pool_id = os.environ.get("COGNITO_USER_POOL_ID", "")
    return f"https://cognito-idp.{region}.amazonaws.com/{pool_id}"


async def _get_jwks() -> dict:
    global _jwks_cache
    if _jwks_cache is None:
        async with httpx.AsyncClient() as client:
            resp = await client.get(_get_jwks_url())
            resp.raise_for_status()
            _jwks_cache = resp.json()
    return _jwks_cache


def _find_key(jwks: dict, kid: str) -> Optional[dict]:
    for key in jwks.get("keys", []):
        if key["kid"] == kid:
            return key
    return None


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> CognitoUser:
    token = credentials.credentials
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token header")

    kid = unverified_header.get("kid")
    if not kid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing kid")

    jwks = await _get_jwks()
    key = _find_key(jwks, kid)
    if not key:
        global _jwks_cache
        _jwks_cache = None
        jwks = await _get_jwks()
        key = _find_key(jwks, kid)
        if not key:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signing key not found")

    try:
        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=os.environ.get("COGNITO_APP_CLIENT_ID", ""),
            issuer=_get_issuer(),
        )
    except JWTError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"Token validation failed: {e}")

    return CognitoUser(
        sub=payload.get("sub", ""),
        email=payload.get("email", ""),
        groups=payload.get("cognito:groups", []),
    )
