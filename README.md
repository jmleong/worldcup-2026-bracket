# FIFA World Cup 2026 Live Bracket Tracker

This package is ready for GitHub Pages.

## Files

- `index.html` - page layout with embedded fallback data.
- `styles.css` - bracket styling.
- `app.js` - rendering, filters, daily snapshot clock logic, browser refreshes, sharing, print tools, standings, and auto advancement.
- `worldcup-data.json` - match data that the page loads and the workflow updates.
- `update_data.py` - GitHub Actions updater.
- `.github/workflows/update-bracket.yml` - deploy workflow.
- `.nojekyll` - tells GitHub Pages to serve files directly.
- `UPDATES_MADE.md` - complete update list.

## Important fix in this version

The snapshot no longer depends only on the saved `snapshotDate` inside `worldcup-data.json`.
The browser calculates the snapshot date from the PDT clock:

- Before 10:30 PM PDT: show the current PDT matchday.
- At or after 10:30 PM PDT: show the next PDT matchday.

That means if GitHub Actions is late, the page still switches to tomorrow in the browser.

## Live updates

The site uses both update paths:

1. GitHub Actions runs at 10:30 PM PDT, retries at 10:35 and 10:45 PM PDT, and polls during broad match windows about every 10 minutes.
2. The browser attempts a direct live API refresh every 60 seconds during active/recent match windows, then falls back to the published `worldcup-data.json`.

Scheduled deployments happen only when `worldcup-data.json` changes. Manual workflow runs can force a deploy.

## Static cutoff

All refresh behavior stops after:

```text
2026-07-20 12:00 PM PDT
```

That is 24 hours after the scheduled July 19 final kickoff.
