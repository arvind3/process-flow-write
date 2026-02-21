# Process Flow Writer

Process Flow Writer is a GitHub Pages UI plus GitHub Actions pipeline that discovers a website, extracts UI context, and publishes a readable process-flow report. It combines OWASP ZAP for discovery and Playwright for DOM-level context.

## What it does

- Accepts a target URL from the UI
- Triggers a GitHub Actions workflow
- Runs OWASP ZAP (spider + AJAX spider) for discovery
- Runs Playwright for page context and screenshots
- Generates:
  - `summary.md`
  - `flow.mmd`
  - `flow.html`
  - `urls.json`
  - `pages.json`
  - `screenshots/`
- Publishes reports to `docs/reports/<timestamp>/` and updates `docs/reports/latest/`
- Updates `docs/reports/index.json` for history listing

## Limitations

- GitHub Pages is static. ZAP and Playwright run only in GitHub Actions.
- Discovery is best-effort and limited by crawl depth, robots settings, and page complexity.
- For authenticated sites, you must configure secrets as described below.
- Broken link checks are sampled, not exhaustive.

## Security notes

- Never paste website credentials into the UI.
- Authenticated crawling is supported only via GitHub Actions secrets.
- GitHub token is stored only in your browser localStorage and never committed.

## Configure repository secrets (Mode A)

Set these secrets in the repository settings:

- `ZAP_USER`
- `ZAP_PASS`
- `LOGIN_URL`
- `USER_FIELD`
- `PASS_FIELD`
- `SUBMIT_SELECTOR`
- `LOGGED_IN_URL_PATTERN`

These are used by Playwright to login, export cookies, and pass cookies to ZAP.

## Workflow inputs

- `target_url` (required)
- `max_pages` (default 50)
- `crawl_depth` (default 3)
- `respect_robots` (default true)
- `authenticated` (default false)

## How to run locally

1. Install dependencies

```bash
npm install
npm --prefix app install
```

2. Build the UI

```bash
npm --prefix app run build
```

3. Run scripts (example)

```bash
$env:TARGET_URL="https://example.com"
$env:REPORT_DIR="reports/20240221-120000"
$env:MAX_PAGES="20"
$env:CRAWL_DEPTH="2"
$env:RESPECT_ROBOTS="true"
$env:AUTHENTICATED="false"

npx tsx scripts/run_discovery.ts
npx tsx scripts/run_playwright.ts
npx tsx scripts/build_flow.ts
npx tsx scripts/render_mermaid.ts
npx tsx scripts/publish_reports.ts
```

4. Or run the local orchestrator

```bash
$env:TARGET_URL="https://example.com"
npm run analyze:local
```

## Quality gates

```bash
npm run lint
npm test
```

## Trigger from the UI

1. Open the GitHub Pages site.
2. Enter a target URL.
3. Provide a GitHub token with `workflow` scope.
4. Click **Trigger Analysis**.

## Repo structure

- `/app` Vite + React UI
- `/scripts` Node scripts for discovery and reporting
- `/docs` GitHub Pages output
- `/.github/workflows/analyze.yml` GitHub Actions workflow

## Sample report

`docs/reports/20260221-120000` contains a demo report generated from `https://example.com`.
