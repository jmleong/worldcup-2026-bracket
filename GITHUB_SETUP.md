# GitHub setup

1. Create or open your repository.
2. Upload these files to the repository root:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `worldcup-data.json`
   - `update_data.py`
   - `.github/workflows/update-bracket.yml`
   - `.nojekyll`
3. Go to **Settings → Pages**.
4. Set **Source** to **GitHub Actions**.
5. Go to **Actions**.
6. Open **Update and publish World Cup bracket**.
7. Click **Run workflow** and keep `force_deploy` enabled for the first run.
8. Your site will publish at `https://YOUR-USERNAME.github.io/worldcup-2026-bracket/` if the repo is named `worldcup-2026-bracket`.

The workflow runs the daily 10:30 PM PDT update and the match-window score polling. Scheduled deployments happen only when `worldcup-data.json` changes.
