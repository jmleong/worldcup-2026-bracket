#!/usr/bin/env python3
"""Refresh World Cup 2026 bracket data.

Modes:
  manual     Always try the API and update changed scores/statuses/teams.
  daily      Try the API and roll the snapshot to the correct PDT matchday.
  live       Only try the API during match windows.
  scheduled  Used by GitHub Actions; daily cron entries become daily mode, all
             other cron entries become live mode.

The script writes worldcup-data.json only when something actually changes. It
also validates the data before publishing and emits GitHub Actions outputs when
GITHUB_OUTPUT is available.
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
FIFA_API_URL = os.environ.get("FIFA_API_URL", "https://api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&count=500&language=en")
FALLBACK_API_URL = os.environ.get("WORLD_CUP_FALLBACK_API_URL", "https://worldcup26.ir/get/games")
def configured_api_urls() -> list[str]:
    raw = os.environ.get("WORLD_CUP_API_URLS") or os.environ.get("WORLD_CUP_API_URL")
    urls = [u.strip() for u in raw.split(",")] if raw else [FIFA_API_URL, FALLBACK_API_URL]
    seen: set[str] = set()
    out: list[str] = []
    for url in urls:
        if url and url not in seen:
            seen.add(url)
            out.append(url)
    return out
API_URL = configured_api_urls()[0]
PT = ZoneInfo("America/Los_Angeles")
DAILY_CRON_PREFIXES = ("30 5", "35 5", "45 5")
DEFAULT_STATIC_HOURS_AFTER_LAST_KICKOFF = 24
LIVE_START_MINUTES_BEFORE = int(os.environ.get("WC_LIVE_START_MINUTES_BEFORE", "15"))
GROUP_WINDOW_MINUTES = int(os.environ.get("WC_GROUP_WINDOW_MINUTES", "720"))
KNOCKOUT_WINDOW_MINUTES = int(os.environ.get("WC_KNOCKOUT_WINDOW_MINUTES", "720"))
GROUP_EXPECTED_FINAL_MINUTES = int(os.environ.get("WC_GROUP_EXPECTED_FINAL_MINUTES", "165"))
KNOCKOUT_EXPECTED_FINAL_MINUTES = int(os.environ.get("WC_KNOCKOUT_EXPECTED_FINAL_MINUTES", "330"))

TEAM_ALIASES = {
    "United States": "USA", "USMNT": "USA", "South Korea": "Korea Republic", "Iran": "IR Iran", "IR Iran": "IR Iran", "IR Iran ": "IR Iran",
    "Cape Verde": "Cabo Verde", "Czech Republic": "Czechia", "Cote d'Ivoire": "Côte d'Ivoire", "Côte d’Ivoire": "Côte d'Ivoire",
    "Ivory Coast": "Côte d'Ivoire", "Curacao": "Curaçao", "Turkiye": "Türkiye", "Turkey": "Türkiye",
    "Democratic Republic of Congo": "Congo DR", "DR Congo": "Congo DR", "DRC": "Congo DR",
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
        return int(value)
    except Exception:
        return None



def localized(value: Any) -> Any:
    """Return an English description from FIFA localized arrays, or the value itself."""
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict) and str(item.get("Locale", "")).lower().startswith("en"):
                return item.get("Description") or item.get("Value")
        for item in value:
            if isinstance(item, dict) and (item.get("Description") or item.get("Value")):
                return item.get("Description") or item.get("Value")
        return None
    if isinstance(value, dict):
        return value.get("Description") or value.get("Value") or value.get("name")
    return value


def fifa_team_name(team: Any) -> str:
    if not isinstance(team, dict):
        return canonical(team)
    return canonical(
        localized(team.get("TeamName"))
        or localized(team.get("Name"))
        or team.get("ShortClubName")
        or team.get("Abbreviation")
        or team.get("IdCountry")
        or ""
    )


def normalize_status_from_fifa(game: dict[str, Any], home_score: int | None, away_score: int | None) -> str | None:
    if "MatchStatus" not in game and "Period" not in game:
        return None
    status_num = to_int(game.get("MatchStatus"))
    # FIFA calendar API uses 0 for finished and 1 for not started in the 2026 World Cup API notes.
    if status_num == 0 and home_score is not None and away_score is not None:
        return "final"
    if status_num == 1:
        return "scheduled"
    if status_num is not None:
        return "live"
    period = to_int(game.get("Period"))
    if period is not None and period not in (0, 1):
        return "live"
    return None

def normalize(game: dict[str, Any]) -> dict[str, Any]:
    # Supports both the official FIFA calendar API and the previous open-source fallback API.
    number = to_int(dig(game, ["MatchNumber", "number", "matchNumber", "match_no", "gameNumber", "id", "match_id"]))
    if "Home" in game or "Away" in game or "HomeTeamScore" in game or "AwayTeamScore" in game:
        home = fifa_team_name(game.get("Home") or game.get("HomeTeam"))
        away = fifa_team_name(game.get("Away") or game.get("AwayTeam"))
        home_score = to_int(game.get("HomeTeamScore", None))
        away_score = to_int(game.get("AwayTeamScore", None))
        if home_score is None:
            home_score = to_int(dig(game, ["Home.Score", "HomeTeam.Score", "home.Score"]))
        if away_score is None:
            away_score = to_int(dig(game, ["Away.Score", "AwayTeam.Score", "away.Score"]))
        home_pen = to_int(game.get("HomeTeamPenaltyScore", None))
        away_pen = to_int(game.get("AwayTeamPenaltyScore", None))
        status = normalize_status_from_fifa(game, home_score, away_score) or "scheduled"
        return {"number": number, "home": home, "away": away, "homeScore": home_score, "awayScore": away_score, "homePenalties": home_pen, "awayPenalties": away_pen, "status": status}

    home = canonical(dig(game, ["home.name_en", "home.name", "homeTeam.name", "home_team.name", "team1.name", "homeTeam", "home_team", "home", "team1"]))
    away = canonical(dig(game, ["away.name_en", "away.name", "awayTeam.name", "away_team.name", "team2.name", "awayTeam", "away_team", "away", "team2"]))
    home_score = to_int(dig(game, ["homeScore", "home_score", "score.home", "home.score", "goalsHome", "team1_score", "score1"]))
    away_score = to_int(dig(game, ["awayScore", "away_score", "score.away", "away.score", "goalsAway", "team2_score", "score2"]))
    home_pen = to_int(dig(game, ["homePenalties", "home_penalties", "penalties.home", "home.penalties", "penalty.home", "score.penalties.home"]))
    away_pen = to_int(dig(game, ["awayPenalties", "away_penalties", "penalties.away", "away.penalties", "penalty.away", "score.penalties.away"]))
    status_raw = str(dig(game, ["status", "match_status", "state", "status.short", "status.long"]) or "").lower()
    if any(word in status_raw for word in ("finish", "final", "complete", "full time")) or status_raw in {"ft", "aet", "pen"}:
        status = "final"
    elif any(word in status_raw for word in ("live", "progress", "playing", "half", "extra", "penalty")):
        status = "live"
    else:
        status = "scheduled"
    return {"number": number, "home": home, "away": away, "homeScore": home_score, "awayScore": away_score, "homePenalties": home_pen, "awayPenalties": away_pen, "status": status}


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
    explicit = os.environ.get("WC_STATIC_AFTER_PT") or data.get("staticAfter")
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


def expected_final_minutes(match: dict[str, Any]) -> int:
    return GROUP_EXPECTED_FINAL_MINUTES if str(match.get("stage") or "") == "Group Stage" else KNOCKOUT_EXPECTED_FINAL_MINUTES


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


def fetch_games() -> tuple[list[dict[str, Any]], str]:
    last_error: Exception | None = None
    for url in configured_api_urls():
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "wc2026-bracket-updater/4.0 (+GitHub Pages)"})
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
            games = [normalize(game) for game in unwrap(payload)]
            games = [game for game in games if game.get("home") and game.get("away")]
            if games:
                return games, url
            last_error = RuntimeError(f"{url} returned no usable games")
        except Exception as exc:
            last_error = exc
            print(f"Data source failed, trying next source if available: {url}: {exc}", file=sys.stderr)
    raise RuntimeError(f"No live data source returned usable matches. Last error: {last_error}")


def is_real_team(data: dict[str, Any], name: object) -> bool:
    return canonical(name) in (data.get("teams") or {})


def same_pair(match: dict[str, Any], game: dict[str, Any]) -> bool:
    mh, ma = canonical(match.get("home")), canonical(match.get("away"))
    gh, ga = canonical(game.get("home")), canonical(game.get("away"))
    return bool(gh and ga and ((mh == gh and ma == ga) or (mh == ga and ma == gh)))


def find_match(data: dict[str, Any], game: dict[str, Any]) -> tuple[dict[str, Any] | None, bool]:
    # Pair matching comes first. FIFA MatchNumber can differ from local poster numbering,
    # so never let a mismatched match number overwrite the wrong game.
    for match in data.get("matches", []):
        if same_pair(match, game):
            reversed_pair = (canonical(match.get("home")), canonical(match.get("away"))) == (canonical(game.get("away")), canonical(game.get("home")))
            return match, reversed_pair
    if game.get("number") is not None:
        for match in data.get("matches", []):
            try:
                if int(match.get("number", -1)) == int(game["number"]):
                    # Only use number fallback for placeholders or when source names are missing.
                    if not game.get("home") or not game.get("away") or not is_real_team(data, match.get("home")) or not is_real_team(data, match.get("away")):
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
            if now >= start + timedelta(minutes=expected_final_minutes(target)):
                return "final"
            if now >= start - timedelta(minutes=LIVE_START_MINUTES_BEFORE):
                return "live"
        except Exception:
            pass
    return "scheduled"


def score_line(match: dict[str, Any]) -> str:
    hs = match.get("homeScore", "—")
    as_ = match.get("awayScore", "—")
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
            text = f"M{target.get('number')}: {score_line(target)} ({target.get('status', 'scheduled')})"
            if before.get("home") != target.get("home") or before.get("away") != target.get("away"):
                text += " — teams filled from live source"
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


def update_metadata(data: dict[str, Any], mode: str, now: datetime, score_changes: int, change_records: list[dict[str, str]]) -> int:
    metadata_changes = 0
    snapshot = compute_snapshot_date(data, now)
    fields: dict[str, Any] = {
        "apiEndpoint": configured_api_urls()[0],
        "apiEndpoints": configured_api_urls(),
        "updateTarget": "Official FIFA score refresh: daily 10:30 PM PDT plus during-match and post-match checks",
        "snapshotRule": "Before 10:30 PM PDT, show today's matchday; after 10:30 PM PDT, show the next PDT matchday. After the final matchday, keep the final matchday as the snapshot.",
        "staticAfter": (static_after(data) or datetime(2026, 7, 20, 12, 0, tzinfo=PT)).isoformat(),
        "liveRefreshRule": "GitHub Actions and open browsers use the official FIFA calendar API first, then fallback sources. Browsers check every 60 seconds during same-day active/recent match windows. Both stop after staticAfter.",
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
    if should_fetch:
        try:
            games, used_url = fetch_games()
            data["apiEndpoint"] = used_url
        except Exception as exc:
            print(f"API refresh skipped because the data source could not be reached: {exc}", file=sys.stderr)
            emit(changed=False, should_deploy=False, fetched=False, mode=mode, reason="api-error")
            return 0
        score_changes, change_records = apply_games(data, games, now)
        print(f"Fetched {len(games)} API game records from {data.get('apiEndpoint', configured_api_urls()[0])}")
    metadata_changes = update_metadata(data, mode, now, score_changes, change_records)
    file_changed = data != original
    if file_changed:
        DATA_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"worldcup-data.json changed: {score_changes} score/status/team field changes, {metadata_changes} metadata changes.")
    else:
        print("worldcup-data.json unchanged.")
    emit(changed=file_changed, should_deploy=file_changed, fetched=should_fetch, mode=mode, score_changes=score_changes, metadata_changes=metadata_changes, active_matches=len(active), reason="changed" if file_changed else "unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
