# Step-by-step GitHub setup

## 1. Download and unzip the package

Use `worldcup-2026-bracket-package.zip`.

You should see these items after unzipping:

- `.github/workflows/update-bracket.yml`
- `.nojekyll`
- `index.html`
- `worldcup-data.json`
- `update_data.py`
- `README.md`

If you do not see `.github`, your computer may be hiding dot-folders. On macOS Finder, press `Command + Shift + .` to show hidden files.

## 2. Create the repository

Go to:

`https://github.com/new?name=worldcup-2026-bracket&description=World+Cup+2026+bracket+tracker&visibility=public`

Recommended settings:

- Repository name: `worldcup-2026-bracket`
- Visibility: Public
- Add README: Off, because this package already includes one
- Add .gitignore: None
- License: None

Click Create repository.

## 3. Upload the files

On the new repository page:

1. Click Add file.
2. Click Upload files.
3. Drag the unzipped package contents into the upload area.
4. Confirm that `.github`, `.nojekyll`, `index.html`, `worldcup-data.json`, and `update_data.py` are included.
5. Commit directly to the `main` branch.

Do not upload the ZIP file itself.

## 4. Turn on GitHub Pages using Actions

Open your repository settings:

`https://github.com/YOUR-USERNAME/worldcup-2026-bracket/settings/pages`

Replace `YOUR-USERNAME` with your GitHub username.

In Pages settings:

1. Find Build and deployment.
2. Set Source to GitHub Actions.
3. Save if GitHub shows a Save button.

## 5. Allow Actions if GitHub asks

Open:

`https://github.com/YOUR-USERNAME/worldcup-2026-bracket/settings/actions`

Use these settings if available:

- Actions permissions: Allow all actions and reusable workflows
- Workflow permissions: Read and write permissions

The workflow also declares the permissions it needs inside the YAML file.

## 6. Run the first update manually

Open:

`https://github.com/YOUR-USERNAME/worldcup-2026-bracket/actions`

Then:

1. Click `Update and publish World Cup bracket` in the left sidebar.
2. Click Run workflow.
3. Choose the `main` branch.
4. Click Run workflow again.
5. Click the running workflow to watch it.

## 7. Open the live site

Your site should be:

`https://YOUR-USERNAME.github.io/worldcup-2026-bracket/`

The workflow summary may also show the exact deployment URL.

## 8. Confirm the nightly schedule

The workflow runs at:

`30 5 * * *` UTC

That equals 10:30 PM PDT during the June/July 2026 tournament.

The snapshot panel will show the next PDT matchday after that run. For example, a June 14 update at 10:30 PM PDT shows all June 15 fixtures.

## 9. Fixes for common issues

### The page is 404

Wait a few minutes after the first successful workflow. Then check Settings -> Pages and confirm Source is GitHub Actions.

### The Actions tab shows no workflow

The `.github/workflows/update-bracket.yml` file was not uploaded. Upload the `.github` folder again.

### The workflow failed during git push

The live deployment can still work because the push-back step is optional. To fix repository history updates, go to Settings -> Actions -> General and set Workflow permissions to Read and write permissions.

### The page opens but old data appears

Hard-refresh the browser. On Windows use `Ctrl + F5`; on Mac use `Command + Shift + R`.
