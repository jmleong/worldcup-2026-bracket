#!/usr/bin/env python3
"""Update worldcup-data.json from a public World Cup API.

Default endpoint: https://worldcup26.ir/get/games
Override: WORLD_CUP_API_URL="https://example.com/matches" python3 update_data.py

The script is defensive: if the API is temporarily unavailable, it still updates
lastUpdated and snapshotDate so the GitHub Pages deployment can succeed with the
latest data already stored in the repository.
"""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

DATA_PATH = Path(__file__).with_name("worldcup-data.json")
API_URL = os.environ.get("WORLD_CUP_API_URL", "https://worldcup26.ir/get/games")
TEAM_ALIASES = {
    "United States": "USA",
    "USMNT": "USA",
    "South Korea": "Korea Republic",
    "Iran": "IR Iran",
    "Cape Verde": "Cabo Verde",
    "Cote d'Ivoire": "Cote d'Ivoire",
    "Cote dIvoire": "Cote d'Ivoire",
    "Ivory Coast": "Cote d'Ivoire",
    "Curacao": "Curacao",
    "Turkiye": "Turkiye",
    "Turkey": "Turkiye",
    "Democratic Republic of Congo": "Congo DR",
    "DR Congo": "Congo DR",
}
UNICODE_FIXES = {
    "Cote d'Ivoire": "Côte d'Ivoire",
    "Cote dIvoire": "Côte d'Ivoire",
    "Curacao": "Curaçao",
    "Turkiye": "Türkiye",
}


def canonical(name: object) -> str:
    value = str(name or "").strip()
    value = UNICODE_FIXES.get(value, value)
    return TEAM_ALIASES.get(value, value)


def dig(obj: dict, paths: list[str]):
    for path in paths:
        cur = obj
        ok = True
        for part in path.split("."):
            if isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                ok = False
                break
        if ok and cur not in (None, ""):
            return cur
    return None


def unwrap(payload):
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []
    for key in ("games", "matches", "fixtures", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return value
        if isinstance(value, dict):
            nested = unwrap(value)
            if nested:
                return nested
    return []


def to_int(value):
    try:
        return int(value)
    except Exception:
        return None


def normalize(game: dict) -> dict:
    num = dig(game, ["number", "matchNumber", "match_no", "gameNumber", "id", "match_id"])
    num = to_int(num)
    home = canonical(dig(game, [
        "home.name_en", "home.name", "homeTeam.name", "home_team.name",
        "team1.name", "homeTeam", "home_team", "home", "team1",
    ]))
    away = canonical(dig(game, [
        "away.name_en", "away.name", "awayTeam.name", "away_team.name",
        "team2.name", "awayTeam", "away_team", "away", "team2",
    ]))
    home_score = dig(game, [
        "homeScore", "home_score", "score.home", "home.score",
        "goalsHome", "team1_score", "score1",
    ])
    away_score = dig(game, [
        "awayScore", "away_score", "score.away", "away.score",
        "goalsAway", "team2_score", "score2",
    ])
    status_raw = str(dig(game, ["status", "match_status", "state"]) or "").lower()
    if any(word in status_raw for word in ("finish", "final", "complete")) or status_raw == "ft":
        status = "final"
    elif "live" in status_raw or "progress" in status_raw:
        status = "live"
    else:
        status = "scheduled"
    return {
        "number": num,
        "home": home,
        "away": away,
        "homeScore": to_int(home_score),
        "awayScore": to_int(away_score),
        "status": status,
    }


def fetch_incoming() -> tuple[list[dict], str | None]:
    request = urllib.request.Request(API_URL, headers={"User-Agent": "wc2026-bracket-updater/1.1"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
        return [normalize(game) for game in unwrap(payload)], None
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
        return [], f"{type(exc).__name__}: {exc}"


def refresh_matches(data: dict, incoming: list[dict]) -> int:
    changed = 0
    for game in incoming:
        if not game["home"] or not game["away"]:
            continue
        target = None
        if game["number"] is not None:
            target = next((m for m in data["matches"] if int(m.get("number", -1)) == game["number"]), None)
        if target is None:
            for match in data["matches"]:
                stored_pair = (canonical(match.get("home")), canonical(match.get("away")))
                incoming_pair = (game["home"], game["away"])
                if stored_pair == incoming_pair or stored_pair == incoming_pair[::-1]:
                    target = match
                    break
        if target is None:
            continue
        reversed_pair = (canonical(target.get("home")), canonical(target.get("away"))) == (game["away"], game["home"])
        if game["homeScore"] is not None and game["awayScore"] is not None:
            target["homeScore"] = game["awayScore"] if reversed_pair else game["homeScore"]
            target["awayScore"] = game["homeScore"] if reversed_pair else game["awayScore"]
            target["status"] = game["status"] if game["status"] in ("final", "live") else "final"
            changed += 1
        elif game["status"] == "live" and target.get("status") != "final":
            target["status"] = "live"
            changed += 1
    return changed


def update_snapshot_fields(data: dict, api_error: str | None) -> None:
    now_pt_dt = datetime.now(ZoneInfo("America/Los_Angeles"))
    now_pt = now_pt_dt.strftime("%B %-d, %Y %-I:%M %p PDT")
    if api_error:
        data["lastUpdated"] = f"Automated refresh: {now_pt}; live API unavailable, kept existing scores"
        data["apiError"] = api_error
    else:
        data["lastUpdated"] = f"Automated refresh: {now_pt}"
        data.pop("apiError", None)

    target_date = now_pt_dt.date()
    if now_pt_dt.hour > 22 or (now_pt_dt.hour == 22 and now_pt_dt.minute >= 30):
        target_date += timedelta(days=1)
    match_dates = sorted({
        match.get("pdt", {}).get("date")
        for match in data.get("matches", [])
        if match.get("pdt", {}).get("date")
    })
    target_key = target_date.isoformat()
    data["snapshotDate"] = next((date for date in match_dates if date >= target_key), target_key)


def main() -> int:
    if not DATA_PATH.exists():
        print(f"Missing {DATA_PATH}", file=sys.stderr)
        return 1
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    incoming, api_error = fetch_incoming()
    changed = refresh_matches(data, incoming)
    update_snapshot_fields(data, api_error)
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    if api_error:
        print(f"Warning: API refresh failed ({api_error}). Deployed existing data with updated snapshotDate.")
    else:
        print(f"Updated {changed} match records from {API_URL}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
