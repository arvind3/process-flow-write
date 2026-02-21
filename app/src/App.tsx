import { useEffect, useMemo, useState } from "react";

type ReportEntry = {
  timestamp: string;
  targetUrl: string;
  generatedAt: string;
  summaryPath: string;
  flowPath: string;
};

type RunState = "idle" | "dispatching" | "queued" | "in_progress" | "completed" | "failed";

type WorkflowRun = {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  created_at: string;
};

const DEFAULT_WORKFLOW = "analyze.yml";
const DEFAULT_REF = "main";

function getDefaultRepo() {
  const { hostname, pathname } = window.location;
  if (hostname.endsWith("github.io")) {
    const owner = hostname.split(".")[0];
    const repo = pathname.split("/").filter(Boolean)[0] || "process-flow-write";
    return { owner, repo };
  }
  return { owner: "arvind3", repo: "process-flow-write" };
}

function toBoolString(value: boolean) {
  return value ? "true" : "false";
}

export default function App() {
  const defaults = useMemo(getDefaultRepo, []);
  const [owner, setOwner] = useState(defaults.owner);
  const [repo, setRepo] = useState(defaults.repo);
  const [workflowFile, setWorkflowFile] = useState(DEFAULT_WORKFLOW);
  const [ref, setRef] = useState(DEFAULT_REF);

  const [token, setToken] = useState(localStorage.getItem("pfw_pat") ?? "");

  const [targetUrl, setTargetUrl] = useState("");
  const [maxPages, setMaxPages] = useState(50);
  const [crawlDepth, setCrawlDepth] = useState(3);
  const [respectRobots, setRespectRobots] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [secretsConfirmed, setSecretsConfirmed] = useState(false);

  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [reportError, setReportError] = useState("");

  const [runState, setRunState] = useState<RunState>("idle");
  const [runInfo, setRunInfo] = useState<WorkflowRun | null>(null);
  const [runMessage, setRunMessage] = useState("");

  useEffect(() => {
    if (token.trim()) {
      localStorage.setItem("pfw_pat", token.trim());
    } else {
      localStorage.removeItem("pfw_pat");
    }
  }, [token]);

  useEffect(() => {
    const loadReports = async () => {
      try {
        const response = await fetch("./reports/index.json", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Reports not ready");
        }
        const data = await response.json();
        setReports(data.reports ?? []);
        setReportError("");
      } catch (error) {
        setReportError("No reports found yet. Run an analysis to generate the first report.");
        setReports([]);
      }
    };
    loadReports();
  }, []);

  const canDispatch = Boolean(token.trim() && targetUrl.trim());

  const dispatchWorkflow = async () => {
    if (!canDispatch) {
      setRunMessage("Provide a target URL and a GitHub token with workflow scope.");
      return;
    }

    if (authenticated && !secretsConfirmed) {
      setRunMessage("Enable authenticated mode only after setting repo secrets.");
      return;
    }

    setRunState("dispatching");
    setRunMessage("");
    setRunInfo(null);

    const payload = {
      ref,
      inputs: {
        target_url: targetUrl.trim(),
        max_pages: String(maxPages),
        crawl_depth: String(crawlDepth),
        respect_robots: toBoolString(respectRobots),
        authenticated: toBoolString(authenticated)
      }
    };

    const dispatchUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/dispatches`;

    const dispatchResponse = await fetch(dispatchUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!dispatchResponse.ok) {
      const message = `Dispatch failed (${dispatchResponse.status}). Check token scope and repo settings.`;
      setRunMessage(message);
      setRunState("failed");
      return;
    }

    setRunState("queued");
    setRunMessage("Workflow dispatched. Waiting for the runner to start...");

    const startedAt = new Date();

    const pollRuns = async () => {
      const runsUrl = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}/runs?per_page=5`;
      const runResponse = await fetch(runsUrl, {
        headers: {
          Authorization: `Bearer ${token.trim()}`,
          Accept: "application/vnd.github+json"
        }
      });

      if (!runResponse.ok) {
        setRunMessage("Unable to read workflow runs. Check token scope.");
        setRunState("failed");
        return true;
      }

      const data = await runResponse.json();
      const runs: WorkflowRun[] = data.workflow_runs ?? [];
      const match = runs.find((run) => new Date(run.created_at) >= startedAt);
      if (!match) {
        return false;
      }

      setRunInfo(match);
      if (match.status === "completed") {
        if (match.conclusion === "success") {
          setRunState("completed");
          setRunMessage("Analysis complete. The latest report is ready.");
        } else {
          setRunState("failed");
          setRunMessage("Workflow completed with errors. Check the Actions logs.");
        }
        return true;
      }

      setRunState(match.status === "in_progress" ? "in_progress" : "queued");
      setRunMessage("Workflow is running. Refresh reports once it completes.");
      return false;
    };

    let attempts = 0;
    const interval = window.setInterval(async () => {
      attempts += 1;
      const done = await pollRuns();
      if (done || attempts > 40) {
        window.clearInterval(interval);
      }
    }, 15000);
  };

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Process Flow Writer</p>
          <h1>Generate navigable process flows with OWASP ZAP and Playwright.</h1>
          <p className="lead">
            Provide a URL, trigger a GitHub Actions run, and publish a browsable report back to GitHub Pages.
          </p>
          <div className="hero-actions">
            <a className="button ghost" href="./reports/latest/flow.html" target="_blank" rel="noreferrer">
              View Latest Report
            </a>
            <a className="button" href="./reports/index.json" target="_blank" rel="noreferrer">
              Reports Index
            </a>
          </div>
        </div>
        <div className="hero-card">
          <div className={`status status-${runState}`}>
            <span>{runState.replace("_", " ")}</span>
          </div>
          <p className="status-message">{runMessage || "Ready to dispatch a new analysis."}</p>
          {runInfo ? (
            <a className="link" href={runInfo.html_url} target="_blank" rel="noreferrer">
              View GitHub Actions Run
            </a>
          ) : null}
        </div>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Run Analysis</h2>
          <div className="field">
            <label htmlFor="targetUrl">Target website URL</label>
            <input
              id="targetUrl"
              type="url"
              placeholder="https://example.com"
              value={targetUrl}
              onChange={(event) => setTargetUrl(event.target.value)}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="maxPages">Max pages</label>
              <input
                id="maxPages"
                type="number"
                min={1}
                max={200}
                value={maxPages}
                onChange={(event) => setMaxPages(Number(event.target.value))}
              />
            </div>
            <div className="field">
              <label htmlFor="crawlDepth">Crawl depth</label>
              <input
                id="crawlDepth"
                type="number"
                min={1}
                max={10}
                value={crawlDepth}
                onChange={(event) => setCrawlDepth(Number(event.target.value))}
              />
            </div>
          </div>
          <div className="field-row">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={respectRobots}
                onChange={(event) => setRespectRobots(event.target.checked)}
              />
              Respect robots.txt
            </label>
            <label className={`checkbox ${secretsConfirmed ? "" : "disabled"}`}>
              <input
                type="checkbox"
                checked={authenticated}
                onChange={(event) => setAuthenticated(event.target.checked)}
                disabled={!secretsConfirmed}
              />
              Authenticated crawl (Mode A)
            </label>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={secretsConfirmed}
              onChange={(event) => {
                setSecretsConfirmed(event.target.checked);
                if (!event.target.checked) {
                  setAuthenticated(false);
                }
              }}
            />
            I set repo secrets for login and accept the risk
          </label>
          <button className="button primary" onClick={dispatchWorkflow} disabled={!canDispatch}>
            Trigger Analysis
          </button>
        </section>

        <section className="card">
          <h2>GitHub Auth</h2>
          <p className="muted">
            Use a GitHub Personal Access Token with the workflow scope. The token is stored only in this browser
            (localStorage) and never committed.
          </p>
          <div className="field">
            <label htmlFor="token">GitHub token</label>
            <input
              id="token"
              type="password"
              placeholder="ghp_..."
              value={token}
              onChange={(event) => setToken(event.target.value)}
            />
          </div>
          <p className="muted">Device flow requires an OAuth app client ID and is not configured by default.</p>
          <button className="button ghost" onClick={() => setToken("")}>Clear Token</button>
          <div className="field-row">
            <div className="field">
              <label htmlFor="owner">Repo owner</label>
              <input id="owner" type="text" value={owner} onChange={(event) => setOwner(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="repo">Repo name</label>
              <input id="repo" type="text" value={repo} onChange={(event) => setRepo(event.target.value)} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="workflowFile">Workflow file</label>
              <input
                id="workflowFile"
                type="text"
                value={workflowFile}
                onChange={(event) => setWorkflowFile(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ref">Git ref</label>
              <input id="ref" type="text" value={ref} onChange={(event) => setRef(event.target.value)} />
            </div>
          </div>
        </section>

        <section className="card">
          <h2>Report History</h2>
          {reportError ? <p className="muted">{reportError}</p> : null}
          {reports.length ? (
            <ul className="report-list">
              {reports.map((report) => (
                <li key={report.timestamp}>
                  <div>
                    <strong>{report.timestamp}</strong>
                    <span className="muted">{report.targetUrl}</span>
                  </div>
                  <div className="report-links">
                    <a className="link" href={report.flowPath} target="_blank" rel="noreferrer">
                      Flow
                    </a>
                    <a className="link" href={report.summaryPath} target="_blank" rel="noreferrer">
                      Summary
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="card">
          <h2>Auth Modes</h2>
          <div className="mode">
            <h3>Mode A (recommended)</h3>
            <p>
              Configure repo secrets for login. The UI never asks for website passwords. Enable authenticated crawl
              only after secrets are set.
            </p>
            <p className="muted">
              Required secrets: ZAP_USER, ZAP_PASS, LOGIN_URL, USER_FIELD, PASS_FIELD, SUBMIT_SELECTOR,
              LOGGED_IN_URL_PATTERN.
            </p>
          </div>
          <div className="mode">
            <h3>Mode B</h3>
            <p>Public crawl only. No credentials required.</p>
          </div>
          <div className="callout">
            Never paste website credentials into this page. Use repository secrets for authentication.
          </div>
        </section>
      </main>
    </div>
  );
}
