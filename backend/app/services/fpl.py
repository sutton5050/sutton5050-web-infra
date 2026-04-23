import time
from typing import Any

import httpx

FPL_BASE = "https://fantasy.premierleague.com/api"
BOOTSTRAP_URL = f"{FPL_BASE}/bootstrap-static/"
PLAYER_URL = f"{FPL_BASE}/element-summary/{{player_id}}/"

POSITION_MAP = {1: "GKP", 2: "DEF", 3: "MID", 4: "FWD"}

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
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(BOOTSTRAP_URL)
            resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        raise FplApiError(f"FPL bootstrap fetch failed: {exc}") from exc

    _bootstrap_cache = resp.json()
    _bootstrap_cached_at = now
    return _bootstrap_cache


async def get_player_history(player_id: int) -> list[dict[str, Any]]:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
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


def build_stat_rows(
    player: dict[str, Any],
    gw_stats: dict[str, Any],
    bootstrap: dict[str, Any],
) -> list[dict[str, Any]]:
    teams = {t["id"]: t["name"] for t in bootstrap.get("teams", [])}
    opponent = teams.get(gw_stats.get("opponent_team"), str(gw_stats.get("opponent_team", "")))
    position = POSITION_MAP.get(player.get("element_type"), "UNK")
    was_home = gw_stats.get("was_home", False)

    return [
        {"label": "Player", "value": f"{player.get('first_name', '')} {player.get('second_name', '')}"},
        {"label": "Web Name", "value": player.get("web_name", "")},
        {"label": "Position", "value": position},
        {"label": "Team", "value": teams.get(player.get("team"), "")},
        {"label": "Gameweek", "value": gw_stats.get("round", "")},
        {"label": "Opponent", "value": opponent},
        {"label": "Venue", "value": "Home" if was_home else "Away"},
        {"label": "Minutes Played", "value": gw_stats.get("minutes", 0)},
        {"label": "Goals Scored", "value": gw_stats.get("goals_scored", 0)},
        {"label": "Assists", "value": gw_stats.get("assists", 0)},
        {"label": "Clean Sheets", "value": gw_stats.get("clean_sheets", 0)},
        {"label": "Goals Conceded", "value": gw_stats.get("goals_conceded", 0)},
        {"label": "Own Goals", "value": gw_stats.get("own_goals", 0)},
        {"label": "Penalties Saved", "value": gw_stats.get("penalties_saved", 0)},
        {"label": "Penalties Missed", "value": gw_stats.get("penalties_missed", 0)},
        {"label": "Yellow Cards", "value": gw_stats.get("yellow_cards", 0)},
        {"label": "Red Cards", "value": gw_stats.get("red_cards", 0)},
        {"label": "Saves", "value": gw_stats.get("saves", 0)},
        {"label": "Bonus Points", "value": gw_stats.get("bonus", 0)},
        {"label": "BPS", "value": gw_stats.get("bps", 0)},
        {"label": "Influence", "value": gw_stats.get("influence", "N/A")},
        {"label": "Creativity", "value": gw_stats.get("creativity", "N/A")},
        {"label": "Threat", "value": gw_stats.get("threat", "N/A")},
        {"label": "ICT Index", "value": gw_stats.get("ict_index", "N/A")},
        {"label": "xG", "value": gw_stats.get("expected_goals", "N/A")},
        {"label": "xA", "value": gw_stats.get("expected_assists", "N/A")},
        {"label": "xGI", "value": gw_stats.get("expected_goal_involvements", "N/A")},
        {"label": "xGC", "value": gw_stats.get("expected_goals_conceded", "N/A")},
        {"label": "Total FPL Points", "value": gw_stats.get("total_points", 0)},
    ]
