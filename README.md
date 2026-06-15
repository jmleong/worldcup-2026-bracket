# FIFA World Cup 2026 Bracket Tracker

This package is ready for GitHub Pages.

Open `index.html` locally to view the tracker, or upload the package contents to GitHub to publish a live page that updates every night.

## What is included

- `index.html` - the visible bracket page.
- `worldcup-data.json` - the match data that the page loads and refreshes.
- `update_data.py` - the updater that fetches scores and updates the next-matchday snapshot.
- `.github/workflows/update-bracket.yml` - the GitHub Actions workflow that runs daily at 10:30 PM PDT and publishes the site.
- `.nojekyll` - tells GitHub Pages to serve the static files directly.

## Important

The live page updates by refreshing `worldcup-data.json`, not by rewriting the entire `index.html` file. The browser loads `index.html`, then fetches the newest `worldcup-data.json` from the same GitHub Pages site.

## GitHub Pages setup

1. Create a new public GitHub repository.
2. Upload the unzipped package contents to the repository root. Do not upload the ZIP file itself.
3. Make sure the hidden `.github/workflows/update-bracket.yml` file is included.
4. Go to repository Settings -> Pages.
5. Under Build and deployment, set Source to GitHub Actions.
6. Go to Actions, choose `Update and publish World Cup bracket`, and click Run workflow.
7. After it finishes, open your Pages URL. For a project repository it is usually:

   `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY-NAME/`

## Daily update schedule

The workflow uses this cron schedule:

```yaml
- cron: "30 5 * * *"
```

GitHub Actions cron runs in UTC. During the June/July World Cup window, 05:30 UTC equals 10:30 PM PDT.

After a 10:30 PM PDT update, the snapshot panel targets the next PDT matchday. Example: a June 14 update at 10:30 PM PDT shows all June 15 fixtures.

## Manual update

Use the Actions tab whenever you want to refresh immediately:

Actions -> Update and publish World Cup bracket -> Run workflow

## API endpoint

The updater uses this endpoint by default:

`https://worldcup26.ir/get/games`

You can change the endpoint by editing `update_data.py` or by adding a `WORLD_CUP_API_URL` environment variable in the workflow.
