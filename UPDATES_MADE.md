# Updates Made

## 20 HTML improvements implemented

1. Daily snapshot is the main daily-view feature and shows every match for the active PDT matchday.
2. All Matches is grouped by date and sorted by kickoff time.
3. Quick filters were added: All, Today, Tomorrow, Next matchday, Upcoming only, Completed.
4. Flags use image mappings with emoji fallback for all countries.
5. Group standings show P, W, D, L, GF, GA, GD, Pts, and status.
6. Best third-place qualifiers table was added.
7. Automatic knockout advancement fills group winners/runners-up and knockout winners/losers when results are known.
8. Bracket connector lines were added with CSS.
9. Mobile layout was improved with round tabs and responsive bracket layout.
10. Spoiler mode was added with a Hide scores / Show scores toggle.
11. Team focus was added; clicking a country filters/selects that team.
12. Venue view was added with a venue selector.
13. Time display toggle was added for PDT, venue local time, and viewer local time.
14. Code is split into `index.html`, `styles.css`, `app.js`, `worldcup-data.json`, and `update_data.py` in the GitHub package.
15. Data reliability checks validate match count, duplicate numbers, dates, times, venues, scores, flags, and snapshot date.
16. Update status box shows last update, snapshot, validation, PDT clock, active windows, deploy rule, and static cutoff.
17. Changes since last update are recorded and displayed.
18. Source display was cleaned up into source cards.
19. Print-friendly buttons were added for full page, bracket, snapshot, and standings.
20. Sharing features were added: copy snapshot, copy link, and download calendar for the snapshot matchday.

## 4 score-update behaviors implemented

1. The 10:30 PM PDT daily update remains active, with 10:35 and 10:45 PM PDT retries.
2. GitHub Actions match-window polling checks scores about every 10 minutes during broad active/recent match windows.
3. Browser-side live refresh checks every 60 seconds during active/recent match windows and re-renders the snapshot locally around the 10:30 PM rollover.
4. Scheduled workflow runs deploy only when `worldcup-data.json` changes. Manual workflow runs can force a deploy.

## Static cutoff implemented

All scheduled/browser refresh behavior stops after:

```text
2026-07-20T12:00:00-07:00
```

## Bug fixed from the 10:34 PM issue

The prior version preferred the saved JSON `snapshotDate`, so an old `snapshotDate` could keep the page stuck on Monday even after 10:30 PM PDT. This version calculates the snapshot from the browser's PDT clock first.
