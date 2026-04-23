from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.auth import SandboxUser, require_auth
from app.services import fpl as fpl_service

router = APIRouter(prefix="/fpl", tags=["fpl"])


@router.get("/bootstrap")
async def bootstrap(_: Annotated[SandboxUser, Depends(require_auth)]):
    try:
        data = await fpl_service.get_bootstrap()
    except fpl_service.FplApiError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return {
        "current_gameweek": fpl_service.current_gameweek(data),
        "total_gameweeks": fpl_service.total_gameweeks(data),
        "teams": [{"id": t["id"], "name": t["name"]} for t in data.get("teams", [])],
        "positions": fpl_service.POSITION_MAP,
    }


@router.get("/players")
async def search_players(
    _: Annotated[SandboxUser, Depends(require_auth)],
    q: str = Query(..., min_length=1, description="Case-insensitive substring match"),
):
    try:
        data = await fpl_service.get_bootstrap()
    except fpl_service.FplApiError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    return {"matches": fpl_service.search_players(q, data)}


@router.get("/players/{player_id}/gameweek/{gameweek}")
async def player_gameweek(
    player_id: int,
    gameweek: int,
    _: Annotated[SandboxUser, Depends(require_auth)],
):
    try:
        bootstrap = await fpl_service.get_bootstrap()
    except fpl_service.FplApiError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    total = fpl_service.total_gameweeks(bootstrap)
    if not (1 <= gameweek <= total):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Gameweek must be between 1 and {total}",
        )

    player = next((p for p in bootstrap.get("elements", []) if p["id"] == player_id), None)
    if not player:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Player not found")

    try:
        history = await fpl_service.get_player_history(player_id)
    except fpl_service.FplApiError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))

    gw_entry = next((h for h in history if h.get("round") == gameweek), None)
    if gw_entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                f"No data for {player.get('first_name', '')} {player.get('second_name', '')} "
                f"in Gameweek {gameweek}. The gameweek may not have been played or the player "
                "did not feature."
            ),
        )

    return {
        "player": {
            "id": player["id"],
            "first_name": player.get("first_name", ""),
            "second_name": player.get("second_name", ""),
            "web_name": player.get("web_name", ""),
        },
        "gameweek": gameweek,
        "stats": fpl_service.build_stat_rows(player, gw_entry, bootstrap),
    }
