#!/usr/bin/env python3
"""Refresh World Cup 2026 bracket data for GitHub Pages.

This updater intentionally separates two things:
1. The nightly snapshot date, which moves to the next PDT matchday at/after 10:30 PM PDT.
2. Score/status updates, which are fetched during extended match windows.

It writes worldcup-data.json only when something actually changes so scheduled runs do not
redeploy the site unnecessarily.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

DATA_PATH = Path(__file__).with_name("worldcup-data.json")
API_URL = os.environ.get("WORLD_CUP_API_URL", "https://worldcup26.ir/get/games")
PT = ZoneInfo("America/Los_Angeles")
STATIC_AFTER_PT = "2026-07-20T12:00:00-07:00"
LIVE_START_MINUTES_BEFORE = int(os.environ.get("WC_LIVE_START_MINUTES_BEFORE", "15"))
GROUP_WINDOW_MINUTES = int(os.environ.get("WC_GROUP_WINDOW_MINUTES", "390"))
KNOCKOUT_WINDOW_MINUTES = int(os.environ.get("WC_KNOCKOUT_WINDOW_MINUTES", "510"))

TEAM_ALIASES = {
    "United States": "USA", "USMNT": "USA", "South Korea": "Korea Republic",
    "Iran": "IR Iran", "IR Iran": "IR Iran", "Cape Verde": "Cabo Verde",
    "Czech Republic": "Czechia", "Cote d'Ivoire": "Côte d'Ivoire", "Côte d’Ivoire": "Côte d'Ivoire",
    "Ivory Coast": "Côte d'Ivoire", "Curacao": "Curaçao", "Turkiye": "Türkiye", "Turkey": "Türkiye",
    "Democratic Republic of Congo": "Congo DR", "DR Congo": "Congo DR", "DRC": "Congo DR",
}

FLAG_CODES = {
    'Mexico':'mx','South Africa':'za','Korea Republic':'kr','Czechia':'cz','Canada':'ca','Bosnia and Herzegovina':'ba','Qatar':'qa','Switzerland':'ch','Brazil':'br','Morocco':'ma','Haiti':'ht','Scotland':'gb-sct','USA':'us','Paraguay':'py','Australia':'au','Türkiye':'tr','Germany':'de','Curaçao':'cw',"Côte d'Ivoire":'ci','Ecuador':'ec','Netherlands':'nl','Japan':'jp','Sweden':'se','Tunisia':'tn','Belgium':'be','Egypt':'eg','IR Iran':'ir','New Zealand':'nz','Spain':'es','Cabo Verde':'cv','Saudi Arabia':'sa','Uruguay':'uy','France':'fr','Senegal':'sn','Iraq':'iq','Norway':'no','Argentina':'ar','Algeria':'dz','Austria':'at','Jordan':'jo','Portugal':'pt','Congo DR':'cd','Uzbekistan':'uz','Colombia':'co','England':'gb-eng','Croatia':'hr','Ghana':'gh','Panama':'pa'
}


def emit(**values: object) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as fh:
        for key, value in values.items():
            text = "true" if value is True else "false" if value is False else str(value)
            fh.write(f"{key}={text}\n")


def canonical(name: object) -> str:
    value = str(name or "").strip()
    return TEAM_ALIASES.get(value, value)


def load_data() -> dict[str, Any]:
    with DATA_PATH.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def save_data(data: dict[str, Any]) -> None:
    DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_pt(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(PT)


def static_after(data: dict[str, Any]) -> datetime:
    explicit = str(os.environ.get("WC_STATIC_AFTER_PT") or data.get("staticAfter") or STATIC_AFTER_PT)
    return parse_pt(explicit)


def is_static(data: dict[str, Any], now: datetime) -> bool:
    return now >= static_after(data)


def dig(obj: Any, paths: list[str]) -> Any:
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


def unwrap(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("games", "matches", "fixtures", "results", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]
        nested = unwrap(value)
        if nested:
            return nested
    return []


def to_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(value)
    except Exception:
        return None


def normalize_game(game: dict[str, Any]) -> dict[str, Any]:
    status_raw = str(dig(game, ["status", "match_status", "state", "status.short", "status.long"]) or "").lower()
    if any(word in status_raw for word in ("finish", "final", "complete", "full time")) or status_raw in {"ft", "aet", "pen"}:
        status = "final"
    elif any(word in status_raw for word in ("live", "progress", "playing", "half", "extra", "penalty")):
        status = "live"
    else:
        status = "scheduled"
    return {
        "number": to_int(dig(game, ["number", "matchNumber", "match_no", "gameNumber", "id", "match_id"])),
        "home": canonical(dig(game, ["home.name_en", "home.name", "homeTeam.name", "home_team.name", "team1.name", "homeTeam", "home_team", "home", "team1"])),
        "away": canonical(dig(game, ["away.name_en", "away.name", "awayTeam.name", "away_team.name", "team2.name", "awayTeam", "away_team", "away", "team2"])),
        "homeScore": to_int(dig(game, ["homeScore", "home_score", "score.home", "home.score", "goalsHome", "team1_score", "score1"])),
        "awayScore": to_int(dig(game, ["awayScore", "away_score", "score.away", "away.score", "goalsAway", "team2_score", "score2"])),
        "homePenalties": to_int(dig(game, ["homePenalties", "home_penalties", "penalties.home", "home.penalties", "score.penalties.home"])),
        "awayPenalties": to_int(dig(game, ["awayPenalties", "away_penalties", "penalties.away", "away.penalties", "score.penalties.away"])),
        "status": status,
    }


def fetch_games() -> list[dict[str, Any]]:
    request = urllib.request.Request(API_URL, headers={"User-Agent": "wc2026-bracket-updater/4.0"})
    with urllib.request.urlopen(request, timeout=35) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return [normalize_game(game) for game in unwrap(payload)]


def match_window_minutes(match: dict[str, Any]) -> int:
    return GROUP_WINDOW_MINUTES if str(match.get("stage") or "") == "Group Stage" else KNOCKOUT_WINDOW_MINUTES


def match_start(match: dict[str, Any]) -> datetime | None:
    iso = (match.get("pdt") or {}).get("iso")
    if not iso:
        return None
    try:
        return parse_pt(str(iso))
    except Exception:
        return None


def active_match_windows(data: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    active: list[dict[str, Any]] = []
    for match in data.get("matches", []):
        start = match_start(match)
        if not start:
            continue
        if start - timedelta(minutes=LIVE_START_MINUTES_BEFORE) <= now <= start + timedelta(minutes=match_window_minutes(match)):
            active.append(match)
    return active


def in_daily_rollover_window(now: datetime) -> bool:
    return (now.hour == 22 and now.minute >= 25) or (now.hour == 23 and now.minute <= 15)


def match_dates(data: dict[str, Any]) -> list[str]:
    return sorted({str((match.get("pdt") or {}).get("date")) for match in data.get("matches", []) if (match.get("pdt") or {}).get("date")})


def compute_snapshot_date(data: dict[str, Any], now: datetime) -> str | None:
    base = now.date()
    if now.hour > 22 or (now.hour == 22 and now.minute >= 30):
        base += timedelta(days=1)
    target_key = base.isoformat()
    dates = match_dates(data)
    return next((date for date in dates if date >= target_key), dates[-1] if dates else None)


def is_real_team(data: dict[str, Any], name: object) -> bool:
    return canonical(name) in (data.get("teams") or {})


def find_match(data: dict[str, Any], game: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    target = None
    if game.get("number") is not None:
        for match in data.get("matches", []):
            try:
                if int(match.get("number", -1)) == int(game["number"]):
                    target = match
                    break
            except Exception:
                pass
    if target is None:
        pair = (game.get("home"), game.get("away"))
        for match in data.get("matches", []):
            match_pair = (canonical(match.get("home")), canonical(match.get("away")))
            if match_pair == pair or match_pair == pair[::-1]:
                target = match
                break
    if target is None:
        return None, False
    reversed_pair = (canonical(target.get("home")), canonical(target.get("away"))) == (game.get("away"), game.get("home"))
    return target, reversed_pair


def infer_status(api_status: str, target: dict[str, Any], now: datetime) -> str:
    if api_status in {"final", "live"}:
        return api_status
    start = match_start(target)
    if not start:
        return "scheduled"
    if now < start:
        return "scheduled"
    if now <= start + timedelta(minutes=match_window_minutes(target)):
        return "live"
    return "final"


def score_line(match: dict[str, Any]) -> str:
    hs = match.get("homeScore", "—")
    away_score = match.get("awayScore", "—")
    hp = match.get("homePenalties")
    ap = match.get("awayPenalties")
    if hp is not None and ap is not None:
        return f"{match.get('home')} {hs} ({hp})-{away_score} ({ap}) {match.get('away')}"
    return f"{match.get('home')} {hs}-{away_score} {match.get('away')}"


def apply_games(data: dict[str, Any], games: list[dict[str, Any]], now: datetime) -> tuple[int, list[dict[str, str]]]:
    changed = 0
    records: list[dict[str, str]] = []
    for game in games:
        if not game.get("home") or not game.get("away"):
            continue
        target, reversed_pair = find_match(data, game)
        if target is None:
            continue
        before = deepcopy(target)
        updates: dict[str, Any] = {}
        api_home = game.get("away") if reversed_pair else game.get("home")
        api_away = game.get("home") if reversed_pair else game.get("away")
        if not is_real_team(data, target.get("home")) and is_real_team(data, api_home):
            updates["home"] = api_home
        if not is_real_team(data, target.get("away")) and is_real_team(data, api_away):
            updates["away"] = api_away
        new_home_score = game.get("awayScore") if reversed_pair else game.get("homeScore")
        new_away_score = game.get("homeScore") if reversed_pair else game.get("awayScore")
        new_home_pen = game.get("awayPenalties") if reversed_pair else game.get("homePenalties")
        new_away_pen = game.get("homePenalties") if reversed_pair else game.get("awayPenalties")
        inferred_status = infer_status(str(game.get("status") or "scheduled"), target, now)
        start = match_start(target)
        may_apply_score = inferred_status in {"live", "final"} or (start is not None and now >= start)
        if new_home_score is not None and new_away_score is not None and may_apply_score:
            updates["homeScore"] = new_home_score
            updates["awayScore"] = new_away_score
            updates["status"] = inferred_status
        elif game.get("status") == "live" and target.get("status") != "final":
            updates["status"] = "live"
        if new_home_pen is not None:
            updates["homePenalties"] = new_home_pen
        if new_away_pen is not None:
            updates["awayPenalties"] = new_away_pen
        for key, value in updates.items():
            if target.get(key) != value:
                target[key] = value
                changed += 1
        if before != target:
            records.append({
                "time": now.strftime("%b %-d, %Y %-I:%M %p PDT"),
                "text": f"M{target.get('number')}: {score_line(target)} ({target.get('status', 'scheduled')})",
            })
    return changed, records


def validate_data(data: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    matches = data.get("matches") or []
    teams = data.get("teams") or {}
    if len(matches) != 104:
        errors.append(f"Expected 104 matches, found {len(matches)}.")
    seen: set[int] = set()
    for match in matches:
        num = match.get("number")
        if num in seen:
            errors.append(f"Duplicate match number {num}.")
        seen.add(num)
        pdt = match.get("pdt") or {}
        if not pdt.get("date") or not pdt.get("iso") or not pdt.get("time"):
            errors.append(f"Match {num} is missing PDT date/time fields.")
        if not match.get("venue"):
            errors.append(f"Match {num} is missing venue.")
        if match.get("status") == "final" and (match.get("homeScore") is None or match.get("awayScore") is None):
            errors.append(f"Match {num} is final but missing a score.")
        if match.get("status") == "scheduled" and (match.get("homeScore") is not None or match.get("awayScore") is not None):
            warnings.append(f"Match {num} is scheduled but has a score.")
        for side in ("home", "away"):
            name = canonical(match.get(side))
            if name in teams:
                info = teams[name]
                if not info.get("flag") and not info.get("flagCode"):
                    warnings.append(f"{name} is missing a flag mapping.")
    snapshot = data.get("snapshotDate")
    if snapshot and not any((m.get("pdt") or {}).get("date") == snapshot for m in matches):
        warnings.append(f"Snapshot date {snapshot} has no matches.")
    return {"ok": not errors, "errors": errors, "warnings": warnings, "checkedBy": "update_data.py validation"}


def ensure_metadata(data: dict[str, Any]) -> None:
    data.setdefault("title", "FIFA World Cup 2026 Bracket Tracker")
    data["version"] = "2026.06.16-live-fix-v4"
    data["apiEndpoint"] = API_URL
    data["staticAfter"] = str(data.get("staticAfter") or STATIC_AFTER_PT)
    data["updateTarget"] = "Daily 10:30 PM PDT plus match-window live score checks"
    data["snapshotRule"] = "Before 10:30 PM PDT, show today's PDT matchday. At or after 10:30 PM PDT, show the next PDT matchday. The browser also enforces this rule locally."
    data["automation"] = {
        "nightlyUpdate": "10:30 PM PDT, with retry schedules at 10:35 PM and 10:45 PM PDT",
        "matchWindowPolling": "GitHub Actions polls about every 10 minutes during extended active/recent match windows.",
        "browserRefresh": "The browser attempts a direct live API refresh every 60 seconds during active/recent match windows, then falls back to the published worldcup-data.json.",
        "deployRule": "Scheduled workflow runs deploy only when worldcup-data.json changes. Manual workflow runs can force a deployment.",
        "staticCutoff": data["staticAfter"],
    }
    for name, info in (data.get("teams") or {}).items():
        if isinstance(info, dict) and not info.get("flagCode") and FLAG_CODES.get(name):
            info["flagCode"] = FLAG_CODES[name]


def update_metadata(data: dict[str, Any], now: datetime, reason: str, records: list[dict[str, str]]) -> None:
    data["lastUpdated"] = now.strftime("%B %-d, %Y %-I:%M %p PDT")
    data["lastUpdateIso"] = now.isoformat()
    data["updateReason"] = reason
    existing = data.get("changesSinceLastUpdate") or []
    data["changesSinceLastUpdate"] = (records + existing)[:25]
    data["validation"] = validate_data(data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force-fetch", action="store_true", help="Fetch live API even outside match windows.")
    parser.add_argument("--dry-run", action="store_true", help="Validate without writing.")
    args = parser.parse_args()

    data = load_data()
    before = deepcopy(data)
    now = datetime.now(PT)
    ensure_metadata(data)

    if is_static(data, now):
        if not data.get("automationStopped"):
            data["automationStopped"] = True
            data["automationStoppedAt"] = now.isoformat()
            update_metadata(data, now, "Final static cutoff reached; scheduled refreshes stopped.", [])
        changed = data != before
        if changed and not args.dry_run:
            save_data(data)
        emit(data_changed=changed, fetched=False, static=True, snapshot=data.get("snapshotDate", ""))
        print("Static cutoff has passed; no live fetch attempted.")
        return 0

    records: list[dict[str, str]] = []
    fetched = False
    fetch_error = ""
    old_snapshot = data.get("snapshotDate")
    new_snapshot = compute_snapshot_date(data, now)
    if new_snapshot and new_snapshot != old_snapshot:
        data["snapshotDate"] = new_snapshot
        records.append({"time": now.strftime("%b %-d, %Y %-I:%M %p PDT"), "text": f"Daily snapshot moved to {new_snapshot}."})

    active = active_match_windows(data, now)
    should_fetch = args.force_fetch or bool(active) or in_daily_rollover_window(now)
    score_changes = 0
    if should_fetch:
        try:
            games = fetch_games()
            fetched = True
            score_changes, api_records = apply_games(data, games, now)
            records.extend(api_records)
        except Exception as exc:
            fetch_error = str(exc)
            print(f"Live API fetch skipped/failed safely: {fetch_error}", file=sys.stderr)

    if records or data != before:
        reason_bits = []
        if new_snapshot != old_snapshot:
            reason_bits.append("snapshot rollover")
        if score_changes:
            reason_bits.append(f"{score_changes} score/status fields changed")
        if fetch_error:
            reason_bits.append("API unavailable; metadata/snapshot only")
        update_metadata(data, now, "; ".join(reason_bits) or "metadata refresh", records)
    else:
        # Keep validation current in memory, but do not write solely to update timestamps.
        data["validation"] = validate_data(data)

    changed = data != before
    if changed and not args.dry_run:
        save_data(data)
    emit(data_changed=changed, fetched=fetched, static=False, snapshot=data.get("snapshotDate", ""), score_changes=score_changes)
    print(json.dumps({
        "changed": changed,
        "fetched": fetched,
        "active_windows": len(active),
        "snapshot": data.get("snapshotDate"),
        "score_changes": score_changes,
        "fetch_error": fetch_error,
    }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
