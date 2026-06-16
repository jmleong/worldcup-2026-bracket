# FIFA World Cup 2026 Bracket Tracker

This is a static GitHub Pages World Cup tracker with:

- All 104 matches grouped by date
- Daily matchday snapshot
- Team flags and country names
- PDT kickoff times by default, plus venue-local and browser-local time modes
- Group fixtures, full standings, and best third-place qualifiers
- True side-hourglass knockout bracket with two left branches, two right branches, center final, third-place path, SVG bracket lines, and automatic advancement when results are available
- Live browser refresh during active matches
- GitHub Actions polling during match windows
- Print, copy, and calendar features

## Files

- `index.html` — page structure
- `styles.css` — styling, print views, hourglass bracket connector lines, mobile layout
- `app.js` — rendering, filters, live refresh, standings, team/venue views, sharing
- `worldcup-data.json` — schedule, teams, scores, metadata, implemented features
- `update_data.py` — score updater and validation checks
- `.github/workflows/update-bracket.yml` — GitHub Actions updater and GitHub Pages publisher

## First deployment

1. Upload all files to the root of your GitHub repository.
2. Make sure `.github/workflows/update-bracket.yml` exists at exactly that path.
3. In repository settings, set GitHub Pages source to **GitHub Actions**.
4. Go to **Actions**, run **Update and publish World Cup bracket**, and leave `force_deploy` enabled.

## Updates

The workflow keeps the 10:30 PM PDT daily snapshot with 10:35 PM and 10:45 PM PDT retries, polls during match windows about every 10 minutes, and deploys only when data changes. The browser also polls every 60 seconds during live match windows while the page is open.

All refreshes stop after `2026-07-20 12:00 PM PDT`.

## Live-score source update

This version uses the FIFA calendar API as the primary live-score source, matching games by the two team names before using match numbers. This avoids writing a score to the wrong local match if FIFA/source match numbering differs from the bracket numbering.

Upload the full package, run the GitHub Action manually once, and hard-refresh the live page.
