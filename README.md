# FIFA World Cup 2026 Bracket Tracker

This is a static GitHub Pages World Cup tracker with:

- All 104 matches grouped by date
- Daily matchday snapshot
- Team flags and country names
- PDT kickoff times by default, plus venue-local and browser-local time modes
- Group fixtures, full standings, and best third-place qualifiers
- Knockout bracket with automatic advancement when results are available
- Live browser refresh during active matches
- GitHub Actions polling during match windows
- Print, copy, and calendar features

## Files

- `index.html` — page structure
- `styles.css` — styling, print views, bracket connector lines, mobile layout
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

The workflow keeps the 10:30 PM PDT daily snapshot, polls during match windows about every 10 minutes, and deploys only when data changes. The browser also polls every 60 seconds during live match windows while the page is open.

All refreshes stop after `2026-07-20 12:00 PM PDT`.
