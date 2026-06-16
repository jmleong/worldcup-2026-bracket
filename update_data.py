#!/usr/bin/env python3
"""Refresh World Cup 2026 bracket data.

This updater is intentionally narrow: it only changes worldcup-data.json score/status/team
fields, the snapshot date metadata, source metadata, recent changes, and validation fields.
It does not modify the HTML/CSS/JS layout files.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.parse
import urllib.request
from copy import deepcopy
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

DATA_PATH = Path(__file__).with_name("worldcup-data.json")
PT = ZoneInfo("America/Los_Angeles")

FIFA_CALENDAR_URL = os.environ.get(
    "FIFA_CALENDAR_URL",
    "https://api.fifa.com/api/v3/calendar/matches?language=en&count=500&from=2026-06-11T00%3A00%3A00Z&to=2026-07-20T23%3A59%3A59Z",
)
FALLBACK_API_URL = os.environ.get("WORLD_CUP_API_URL", "https://worldcup26.ir/get/games")
DAILY_CRON_PREFIXES = ("30 5", "35 5", "45 5")
DEFAULT_STATIC_HOURS_AFTER_LAST_KICKOFF = 24
LIVE_START_MINUTES_BEFORE = int(os.environ.get("WC_LIVE_START_MINUTES_BEFORE", "15"))
GROUP_WINDOW_MINUTES = int(os.environ.get("WC_GROUP_WINDOW_MINUTES", "900"))
KNOCKOUT_WINDOW_MINUTES = int(os.environ.get("WC_KNOCKOUT_WINDOW_MINUTES", "900"))

TEAM_ALIASES = {
    "United States": "USA",
    "USMNT": "USA",
    "South Korea": "Korea Republic",
    "Iran": "IR Iran",
    "IR Iran": "IR Iran",
    "IRN": "IR Iran",
    "Cape Verde": "Cabo Verde",
    "Czech Republic": "Czechia",
    "Cote d'Ivoire": "C\u00f4te d'Ivoire",
    "C\u00f4te d'Ivoire": "C\u00f4te d'Ivoire",
    "Ivory Coast": "C\u00f4te d'Ivoire",
    "Curacao": "Cura\u00e7ao",
    "Turkiye": "T\u00fcrkiye",
    "Turkey": "T\u00fcrkiye",
    "Democratic Republic of Congo": "Congo DR",
    "DR Congo": "Congo DR",
    "DRC": "Congo DR",
    "Korea": "Korea Republic",
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


def dig(obj: Any, paths: list[str]) -> Any:
    for path in paths:
        cur = obj
        ok = True
        for part in path.split("."):
            if isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
                cur = cur[int(part)]
            elif isinstance(cur, dict) and part in cur:
                cur = cur[part]
            else:
                ok = False
                break
        if ok and cur not in (None, ""):
            return cur
    return None


def localized_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        preferred = None
        fallback = None
        for item in value:
            if not isinstance(item, dict):
                continue
            desc = item.get("Description") or item.get("description") or item.get("Name")
            if not desc:
                continue
            fallback = fallback or str(desc)
            locale = str(item.get("Locale") or item.get("locale") or "").lower()
            if locale in {"en", "en-gb", "en-us"}:
                preferred = str(desc)
                break
        return preferred or fallback
    if isinstance(value, dict):
        return localized_text(value.get("TeamName") or value.get("Name") or value.get("Description") or value.get("description"))
    return str(value)


def team_name(game: dict[str, Any], side: str) -> str:
    key = "Home" if side == "home" else "Away"
    alt = "HomeTeam" if side == "home" else "AwayTeam"
    paths = [
        f"{key}.TeamName",
        f"{alt}.TeamName",
        f"{key}.Name",
        f"{alt}.Name",
        f"{key}.ShortClubName",
        f"{alt}.ShortClubName",
        f"{key}.Abbreviation",
        f"{alt}.Abbreviation",
        f"{side}.name_en",
        f"{side}.name",
        f"{side}Team.name",
        f"{side}_team.name",
        "team1.name" if side == "home" else "team2.name",
        f"{side}Team",
        f"{side}_team",
        side,
        "team1" if side == "home" else "team2",
    ]
    for path in paths:
        value = dig(game, [path])
        text = localized_text(value)
        if text:
            return canonical(text)
    return ""


def unwrap(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("Results", "results", "games", "matches", "fixtures", "data"):
        value = payload.get(key)
        if isinstance(value, list):
            return [x for x in value if isinstance(x, dict)]
        if isinstance(value, dict):
            nested = unwrap(value)
            if nested:
                return nested
    return []


def to_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(str(value)))
    except Exception:
        return None


def fifa_status(game: dict[str, Any], has_score: bool) -> str:
    status_raw = str(dig(game, ["status", "match_status", "state", "status.short", "status.long", "MatchStatusText", "Status"]) or "").lower()
    if any(word in status_raw for word in ("finish", "final", "complete", "full time", "full-time")) or status_raw in {"ft", "aet", "pen"}:
        return "final"
    if any(word in status_raw for word in ("live", "progress", "playing", "half", "extra", "penalty")):
        return "live"
    if has_score:
        winner = dig(game, ["Winner"])
        result_type = to_int(dig(game, ["ResultType"]))
        period = to_int(dig(game, ["Period"]))
        # FIFA calendar objects commonly use ResultType=1 and/or a late Period value for completed matches.
        if winner not in (None, "") or result_type == 1 or (period is not None and period >= 10):
            return "final"
    return "scheduled"


def normalize(game: dict[str, Any]) -> dict[str, Any]:
    number = to_int(dig(game, ["MatchNumber", "matchNumber", "number", "match_no", "gameNumber", "Properties.IdIFES", "id", "match_id"]))
    home = team_name(game, "home")
    away = team_name(game, "away")
    home_score = to_int(dig(game, ["HomeTeamScore", "Home.Score", "HomeTeam.Score", "homeScore", "home_score", "score.home", "home.score", "goalsHome", "team1_score", "score1"]))
    away_score = to_int(dig(game, ["AwayTeamScore", "Away.Score", "AwayTeam.Score", "awayScore", "away_score", "score.away", "away.score", "goalsAway", "team2_score", "score2"]))
    home_pen = to_int(dig(game, ["HomeTeamPenaltyScore", "homePenalties", "home_penalties", "penalties.home", "home.penalties", "penalty.home", "score.penalties.home"]))
    away_pen = to_int(dig(game, ["AwayTeamPenaltyScore", "awayPenalties", "away_penalties", "penalties.away", "away.penalties", "penalty.away", "score.penalties.away"]))
    has_score = home_score is not None and away_score is not None
    status = fifa_status(game, has_score)
    return {
        "number": number,
        "home": home,
        "away": away,
        "homeScore": home_score,
        "awayScore": away_score,
        "homePenalties": home_pen,
        "awayPenalties": away_pen,
        "status": status,
        "source": "FIFA" if ("IdCompetition" in game or "HomeTeamScore" in game or "Home" in game) else "Fallback API",
    }


def parse_pt(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(PT)


def latest_match_start(data: dict[str, Any]) -> datetime | None:
    starts: list[datetime] = []
    for match in data.get("matches", []):
        iso = (match.get("pdt") or {}).get("iso")
        if iso:
            try:
                starts.append(parse_pt(iso))
            except Exception:
                pass
    return max(starts) if starts else None


def static_after(data: dict[str, Any]) -> datetime | None:
    explicit = os.environ.get("WC_STATIC_AFTER_PT") or data.get("staticAfter") or (data.get("liveRefresh") or {}).get("staticAfter")
    if explicit:
        try:
            return parse_pt(str(explicit))
        except Exception:
            pass
    last_start = latest_match_start(data)
    if not last_start:
        return None
    hours = int(os.environ.get("WC_STATIC_AFTER_HOURS", str(DEFAULT_STATIC_HOURS_AFTER_LAST_KICKOFF)))
    return last_start + timedelta(hours=hours)


def is_static(data: dict[str, Any], now: datetime) -> bool:
    cutoff = static_after(data)
    return bool(cutoff and now >= cutoff)


def match_window_minutes(match: dict[str, Any]) -> int:
    return GROUP_WINDOW_MINUTES if str(match.get("stage") or "") == "Group Stage" else KNOCKOUT_WINDOW_MINUTES


def active_match_windows(data: dict[str, Any], now: datetime) -> list[dict[str, Any]]:
    active: list[dict[str, Any]] = []
    for match in data.get("matches", []):
        iso = (match.get("pdt") or {}).get("iso")
        if not iso:
            continue
        try:
            start = parse_pt(iso)
        except Exception:
            continue
        if start - timedelta(minutes=LIVE_START_MINUTES_BEFORE) <= now <= start + timedelta(minutes=match_window_minutes(match)):
            active.append(match)
    return active


def fetch_json(url: str) -> Any:
    request = urllib.request.Request(url, headers={"User-Agent": "wc2026-bracket-updater/4.0", "Accept": "application/json,text/plain,*/*"})
    with urllib.request.urlopen(request, timeout=35) as response:
        return json.loads(response.read().decode("utf-8"))


def known_team_names(data: dict[str, Any]) -> set[str]:
    return {canonical(name) for name in (data.get("teams") or {}).keys()}


def fetch_fifa_games(data: dict[str, Any]) -> list[dict[str, Any]]:
    payload = fetch_json(FIFA_CALENDAR_URL)
    games = [normalize(game) for game in unwrap(payload)]
    teams = known_team_names(data)
    return [g for g in games if canonical(g.get("home")) in teams and canonical(g.get("away")) in teams]


def fetch_fallback_games() -> list[dict[str, Any]]:
    payload = fetch_json(FALLBACK_API_URL)
    return [normalize(game) for game in unwrap(payload)]


def fetch_games(data: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    combined: list[dict[str, Any]] = []
    sources: list[str] = []
    errors: list[str] = []
    try:
        fifa = fetch_fifa_games(data)
        combined.extend(fifa)
        sources.append(f"FIFA calendar API ({len(fifa)} usable records)")
    except Exception as exc:
        errors.append(f"FIFA calendar API error: {exc}")
    try:
        fallback = fetch_fallback_games()
        combined.extend(fallback)
        sources.append(f"Fallback World Cup API ({len(fallback)} records)")
    except Exception as exc:
        errors.append(f"Fallback API error: {exc}")
    if not combined and errors:
        raise RuntimeError("; ".join(errors))
    return combined, sources or errors


def is_real_team(data: dict[str, Any], name: object) -> bool:
    return canonical(name) in (data.get("teams") or {})


def find_match(data: dict[str, Any], game: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    home = canonical(game.get("home"))
    away = canonical(game.get("away"))
    if home and away and is_real_team(data, home) and is_real_team(data, away):
        for match in data.get("matches", []):
            match_pair = (canonical(match.get("home")), canonical(match.get("away")))
            if match_pair == (home, away):
                return match, False
            if match_pair == (away, home):
                return match, True
    if game.get("number") is not None:
        for match in data.get("matches", []):
            try:
                if int(match.get("number", -1)) == int(game["number"]):
                    return match, False
            except Exception:
                pass
    return None, False


def infer_status(api_status: str, target: dict[str, Any], now: datetime) -> str:
    if api_status in {"final", "live"}:
        return api_status
    iso = (target.get("pdt") or {}).get("iso")
    if iso:
        try:
            start = parse_pt(iso)
            if now <= start + timedelta(minutes=150):
                return "live"
        except Exception:
            pass
    return "final"


def score_line(match: dict[str, Any]) -> str:
    hs = match.get("homeScore", "-")
    as_ = match.get("awayScore", "-")
    hp = match.get("homePenalties")
    ap = match.get("awayPenalties")
    if hp is not None and ap is not None:
        return f"{match.get('home')} {hs} ({hp})-{as_} ({ap}) {match.get('away')}"
    return f"{match.get('home')} {hs}-{as_} {match.get('away')}"


def apply_games(data: dict[str, Any], games: list[dict[str, Any]], now: datetime) -> tuple[int, list[dict[str, str]]]:
    changed = 0
    change_records: list[dict[str, str]] = []
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
        if new_home_score is not None and new_away_score is not None:
            updates["homeScore"] = new_home_score
            updates["awayScore"] = new_away_score
            updates["status"] = infer_status(str(game.get("status") or "scheduled"), target, now)
            updates["resultSource"] = str(game.get("source") or "live source")
        elif game.get("status") == "live" and target.get("status") != "final":
            updates["status"] = "live"
            updates["resultSource"] = str(game.get("source") or "live source")
        if new_home_pen is not None:
            updates["homePenalties"] = new_home_pen
        if new_away_pen is not None:
            updates["awayPenalties"] = new_away_pen
        for key, value in updates.items():
            if target.get(key) != value:
                target[key] = value
                changed += 1
        if before != target:
            text = f"M{target.get('number')}: {score_line(target)} ({target.get('status', 'scheduled')})"
            if before.get("home") != target.get("home") or before.get("away") != target.get("away"):
                text += " - teams filled from live source"
            source = target.get("resultSource")
            if source:
                text += f" - source: {source}"
            change_records.append({"time": now.strftime("%b %-d, %Y %-I:%M %p PDT"), "text": text})
    return changed, change_records


def match_dates(data: dict[str, Any]) -> list[str]:
    return sorted({str((match.get("pdt") or {}).get("date")) for match in data.get("matches", []) if (match.get("pdt") or {}).get("date")})


def compute_snapshot_date(data: dict[str, Any], now: datetime) -> str | None:
    base = now.date()
    if now.hour > 22 or (now.hour == 22 and now.minute >= 30):
        base += timedelta(days=1)
    target_key = base.isoformat()
    dates = match_dates(data)
    if not dates:
        return None
    return next((date for date in dates if date >= target_key), dates[-1])


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


def update_metadata(data: dict[str, Any], mode: str, now: datetime, score_changes: int, change_records: list[dict[str, str]], sources: list[str]) -> int:
    metadata_changes = 0
    snapshot = compute_snapshot_date(data, now)
    live_refresh = data.get("liveRefresh") or {}
    live_refresh.update({
        "browserPollSeconds": 60,
        "githubActionPollMinutes": 10,
        "startMinutesBeforeKickoff": LIVE_START_MINUTES_BEFORE,
        "groupStageWindowMinutes": GROUP_WINDOW_MINUTES,
        "knockoutWindowMinutes": KNOCKOUT_WINDOW_MINUTES,
        "staticAfter": "2026-07-20T12:00:00-07:00",
    })
    fields: dict[str, Any] = {
        "apiEndpoint": FIFA_CALENDAR_URL,
        "apiEndpoints": [FIFA_CALENDAR_URL, FALLBACK_API_URL],
        "liveRefresh": live_refresh,
        "updateTarget": "Daily 10:30 PM PDT plus during-match live score checks",
        "snapshotRule": "Before 10:30 PM PDT, show today's matchday; after 10:30 PM PDT, show the next PDT matchday. After the final matchday, keep the final matchday as the snapshot.",
        "staticAfter": "2026-07-20T12:00:00-07:00",
        "liveRefreshRule": "GitHub Actions checks during match windows; open browsers check live scores every 60 seconds during active/recent match windows. Both stop after staticAfter.",
        "lastRefreshSources": sources,
        "validation": validate_data(data),
    }
    if snapshot:
        fields["snapshotDate"] = snapshot
    if change_records:
        existing = data.get("recentChanges") or []
        fields["recentChanges"] = (change_records + existing)[:20]
    if score_changes or mode in {"daily", "manual"}:
        now_text = now.strftime("%B ") + str(now.day) + now.strftime(", %Y %I:%M %p PDT")
        fields["lastUpdated"] = f"Automated {mode} refresh: {now_text}"
        fields["lastSuccessfulUpdate"] = now_text
    for key, value in fields.items():
        if data.get(key) != value:
            data[key] = value
            metadata_changes += 1
    return metadata_changes


def choose_mode(arg_mode: str) -> str:
    if arg_mode != "scheduled":
        return arg_mode
    schedule = os.environ.get("GITHUB_EVENT_SCHEDULE", "").strip()
    if any(schedule.startswith(prefix) for prefix in DAILY_CRON_PREFIXES):
        return "daily"
    return "live"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["manual", "daily", "live", "scheduled"], default="manual")
    args = parser.parse_args()
    if not DATA_PATH.exists():
        print(f"Missing {DATA_PATH}", file=sys.stderr)
        return 1
    data = json.loads(DATA_PATH.read_text(encoding="utf-8"))
    original = deepcopy(data)
    now = datetime.now(PT)
    mode = choose_mode(args.mode)
    cutoff = static_after(data)
    if is_static(data, now):
        print(f"Static cutoff reached ({cutoff.isoformat() if cutoff else 'unknown'}). No refresh attempted.")
        emit(changed=False, should_deploy=False, fetched=False, mode=mode, reason="static-cutoff")
        return 0
    active = active_match_windows(data, now)
    should_fetch = mode in {"manual", "daily"} or bool(active)
    if mode == "live" and not active:
        print("No active or recently active match window. No refresh attempted.")
        emit(changed=False, should_deploy=False, fetched=False, mode=mode, active_matches=0, reason="no-active-match-window")
        return 0
    score_changes = 0
    change_records: list[dict[str, str]] = []
    sources: list[str] = []
    if should_fetch:
        try:
            games, sources = fetch_games(data)
        except Exception as exc:
            print(f"Live refresh skipped because data sources could not be reached: {exc}", file=sys.stderr)
            metadata_changes = update_metadata(data, mode, now, 0, [], [f"source error: {exc}"])
            if data != original:
                DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            emit(changed=data != original, should_deploy=data != original, fetched=False, mode=mode, reason="api-error")
            return 0
        score_changes, change_records = apply_games(data, games, now)
        print(f"Fetched {len(games)} usable game records from: {', '.join(sources)}")
    metadata_changes = update_metadata(data, mode, now, score_changes, change_records, sources)
    file_changed = data != original
    if file_changed:
        DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"worldcup-data.json changed: {score_changes} score/status/team field changes, {metadata_changes} metadata changes.")
    else:
        print("worldcup-data.json unchanged.")
    emit(
        changed=file_changed,
        should_deploy=file_changed,
        fetched=should_fetch,
        mode=mode,
        score_changes=score_changes,
        metadata_changes=metadata_changes,
        active_matches=len(active),
        reason="changed" if file_changed else "unchanged",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
