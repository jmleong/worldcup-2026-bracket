# GitHub update steps

1. Download and unzip the package.
2. In your GitHub repository, go to **Code**.
3. Click the small **+** button beside the green **Code** button, then choose **Upload files**.
4. Upload the contents of this package, including hidden files/folders:
   - `.github/`
   - `.nojekyll`
   - `index.html`
   - `styles.css`
   - `app.js`
   - `worldcup-data.json`
   - `update_data.py`
   - `README.md`
   - `GITHUB_SETUP.md`
   - `UPDATES_MADE.md`
5. Commit directly to `main`.
6. Go to **Settings > Pages** and set **Source** to **GitHub Actions**.
7. Go to **Actions > Update and publish World Cup bracket > Run workflow**.
8. Keep `force_deploy` enabled and run the workflow.
9. Open your site and hard refresh:
   - Mac: Command + Shift + R
   - Windows: Ctrl + F5

The live site should be available at:

```text
https://jmleong.github.io/worldcup-2026-bracket/
```
