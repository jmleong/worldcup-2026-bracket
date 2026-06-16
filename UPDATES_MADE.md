# Updates implemented

This package now implements the 20 previously suggested HTML improvements as working features, not merely as a roadmap.

## 20 implemented HTML improvements

1. **Daily snapshot as the main daily-view feature** — the hero snapshot shows all matches for the selected PDT matchday.
2. **All Matches grouped by date with sticky day headers** — each matchday is separated, sticky, and sorted by kickoff time.
3. **Today, Tomorrow, Next Matchday, Upcoming, and Completed quick buttons** — quick filters are live in the All Matches section.
4. **Reliable country flags** — flag image mappings, drawn England/Scotland flags, and emoji fallbacks are included.
5. **Full group standings** — tables now include P, W, D, L, GF, GA, GD, Pts, and status.
6. **Third-place qualifiers table** — the best third-place race is ranked separately.
7. **Automatic knockout advancement** — group winners/runners-up fill after group completion; knockout winners/losers fill after final results; third-place placeholders resolve when clear.
8. **True hourglass knockout bracket with connector lines** — the knockout section now has two branches on the left, two branches on the right, a center final, a third-place branch, and SVG bracket lines connecting each winner path.
9. **Mobile bracket controls** — round tabs and responsive layouts make the bracket easier on phones.
10. **Spoiler mode** — scores can be hidden or shown with a persistent toggle.
11. **Team filtering inside Match Explorer** — clicking a country or choosing a team now filters the combined Match Explorer instead of opening a separate Team Focus tab.
12. **Venue filtering inside Match Explorer** — the old separate Venue View is folded into the combined Match Explorer with a local Venue dropdown and summary card.
13. **Time display toggle** — PDT, venue-local, and browser-local time modes are available.
14. **Split code files** — the GitHub package now uses `index.html`, `styles.css`, `app.js`, and `worldcup-data.json`. A standalone bundled HTML is also included separately.
15. **Update reliability checks** — `update_data.py` and the browser validate match counts, dates, venues, flags, scores, and snapshot date.
16. **Update status box** — the page shows last update, snapshot, validation, next nightly update, active windows, deploy behavior, and static cutoff.
17. **Changes since last update** — recent score/status/team-name updates are saved by the updater and displayed on the page.
18. **Cleaner source display** — source cards are compact and show update context.
19. **Print-friendly views** — full page, bracket-only, snapshot-only, and standings-only print modes are included.
20. **Sharing features** — copy snapshot, copy page link, and calendar download actions are included.

## 4 score-update behaviors configured

1. **Keep the 10:30 PM PDT daily update** — the nightly workflow rolls the snapshot forward and retries at 10:35 PM and 10:45 PM PDT to reduce GitHub schedule delays.
2. **Match-window GitHub Actions polling** — scheduled polling checks FIFA-first score/status updates during active and recently active match windows.
3. **Browser-side live refresh every 60 seconds** — open pages poll FIFA first during active/recent match windows, then fall back to the published JSON and backup API.
4. **Only deploy when data changes** — scheduled runs publish only when `worldcup-data.json` actually changes.

## Static cutoff

All automatic refresh behavior stops after `2026-07-20 12:00 PM PDT`, which is 24 hours after the scheduled July 19 final kickoff window. After that, the site remains static.
