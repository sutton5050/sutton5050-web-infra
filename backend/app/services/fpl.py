import time
from typing import Any

import httpx

FPL_BASE = "https://fantasy.premierleague.com/api"
BOOTSTRAP_URL = f"{FPL_BASE}/bootstrap-static/"
PLAYER_URL = f"{FPL_BASE}/element-summary/{{player_id}}/"

# FPL's edge (Cloudflare) blocks the default httpx User-Agent as a bot.
# Spoofing a desktop browser UA is the standard workaround.
_FPL_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-GB,en;q=0.9",
}

POSITION_MAP = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}

_PHOTO_BASE = "https://resources.premierleague.com/premierleague/photos/players/250x250"
_CREST_BASE = "https://resources.premierleague.com/premierleague/badges/70"


def _photo_url(photo_field: str | None) -> str | None:
    # FPL stores photo as "174432.jpg" — the public URL uses a 'p' prefix and .png.
    if not photo_field:
        return None
    stem = photo_field.rsplit(".", 1)[0]
    return f"{_PHOTO_BASE}/p{stem}.png"


def _team_info(team: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": team.get("id"),
        "name": team.get("name"),
        "short_name": team.get("short_name"),
        "crest_url": f"{_CREST_BASE}/t{team.get('code')}.png" if team.get("code") else None,
    }

# Bootstrap response is ~1MB and changes maybe once per GW. An hour TTL is
# plenty to keep the UI snappy without serving badly stale data.
_BOOTSTRAP_TTL_SECONDS = 3600
_bootstrap_cache: dict[str, Any] | None = None
_bootstrap_cached_at: float = 0


class FplApiError(Exception):
    """Raised when the upstream FPL API is unreachable or returns non-2xx."""


async def get_bootstrap() -> dict[str, Any]:
    global _bootstrap_cache, _bootstrap_cached_at

    now = time.monotonic()
    if _bootstrap_cache and (now - _bootstrap_cached_at) < _BOOTSTRAP_TTL_SECONDS:
        return _bootstrap_cache

    try:
        async with httpx.AsyncClient(timeout=10, headers=_FPL_HEADERS) as client:
            resp = await client.get(BOOTSTRAP_URL)
            resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        raise FplApiError(f"FPL bootstrap fetch failed: {exc}") from exc

    _bootstrap_cache = resp.json()
    _bootstrap_cached_at = now
    return _bootstrap_cache


async def get_player_history(player_id: int) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=10, headers=_FPL_HEADERS) as client:
            resp = await client.get(PLAYER_URL.format(player_id=player_id))
            resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        raise FplApiError(f"FPL player fetch failed: {exc}") from exc

    return resp.json().get("history", [])


def search_players(query: str, bootstrap: dict[str, Any], limit: int = 10) -> list[dict[str, Any]]:
    q = query.strip().lower()
    if not q:
        return []
    elements = bootstrap.get("elements", [])
    teams = {t["id"]: t["name"] for t in bootstrap.get("teams", [])}

    matches: list[dict[str, Any]] = []
    for p in elements:
        web = (p.get("web_name") or "").lower()
        first = (p.get("first_name") or "").lower()
        second = (p.get("second_name") or "").lower()
        full = f"{first} {second}".strip()
        if q in web or q in first or q in second or q in full:
            matches.append({
                "id": p["id"],
                "web_name": p.get("web_name", ""),
                "first_name": p.get("first_name", ""),
                "second_name": p.get("second_name", ""),
                "team": teams.get(p.get("team"), ""),
                "position": POSITION_MAP.get(p.get("element_type"), "UNK"),
            })
    return matches[:limit]


def current_gameweek(bootstrap: dict[str, Any]) -> int:
    """Return the 'current' (live or most recently finished) gameweek."""
    events = bootstrap.get("events", [])
    for ev in events:
        if ev.get("is_current"):
            return ev.get("id", 1)
    # Fallback: last finished event, or 1
    finished = [ev["id"] for ev in events if ev.get("finished")]
    return max(finished) if finished else 1


def total_gameweeks(bootstrap: dict[str, Any]) -> int:
    events = bootstrap.get("events", [])
    return len(events) or 38


def _float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value) if value is not None else default
    except (TypeError, ValueError):
        return default


def build_game_report(
    player: dict[str, Any],
    gw_stats: dict[str, Any],
    bootstrap: dict[str, Any],
) -> dict[str, Any]:
    """Shape a single gameweek into a richer response the frontend can render directly."""
    teams_by_id = {t["id"]: t for t in bootstrap.get("teams", [])}
    player_team = teams_by_id.get(player.get("team"), {})
    opponent_team = teams_by_id.get(gw_stats.get("opponent_team"), {})
    position = POSITION_MAP.get(player.get("element_type"), "UNK")
    was_home = bool(gw_stats.get("was_home", False))

    return {
        "player": {
            "id": player["id"],
            "first_name": player.get("first_name", ""),
            "second_name": player.get("second_name", ""),
            "web_name": player.get("web_name", ""),
            "position": position,
            "photo_url": _photo_url(player.get("photo")),
            "team": _team_info(player_team),
        },
        "gameweek": gw_stats.get("round"),
        "fixture": {
            "opponent": _team_info(opponent_team),
            "was_home": was_home,
            "venue": "Home" if was_home else "Away",
        },
        "summary": {
            "total_points": int(gw_stats.get("total_points", 0)),
            "minutes": int(gw_stats.get("minutes", 0)),
            "starts": int(gw_stats.get("starts", 1 if gw_stats.get("minutes", 0) >= 60 else 0)),
            "bps": int(gw_stats.get("bps", 0)),
            "bonus": int(gw_stats.get("bonus", 0)),
        },
        "attacking": {
            "goals": int(gw_stats.get("goals_scored", 0)),
            "assists": int(gw_stats.get("assists", 0)),
            "expected_goals": _float(gw_stats.get("expected_goals")),
            "expected_assists": _float(gw_stats.get("expected_assists")),
            "expected_goal_involvements": _float(gw_stats.get("expected_goal_involvements")),
        },
        "defending": {
            "clean_sheets": int(gw_stats.get("clean_sheets", 0)),
            "goals_conceded": int(gw_stats.get("goals_conceded", 0)),
            "saves": int(gw_stats.get("saves", 0)),
            "expected_goals_conceded": _float(gw_stats.get("expected_goals_conceded")),
        },
        "discipline": {
            "yellow_cards": int(gw_stats.get("yellow_cards", 0)),
            "red_cards": int(gw_stats.get("red_cards", 0)),
            "own_goals": int(gw_stats.get("own_goals", 0)),
            "penalties_saved": int(gw_stats.get("penalties_saved", 0)),
            "penalties_missed": int(gw_stats.get("penalties_missed", 0)),
        },
        "ict": {
            "influence": _float(gw_stats.get("influence")),
            "creativity": _float(gw_stats.get("creativity")),
            "threat": _float(gw_stats.get("threat")),
            "ict_index": _float(gw_stats.get("ict_index")),
        },
    }
