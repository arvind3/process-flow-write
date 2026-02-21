import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, writeJson } from "./lib.js";

const reportDir = process.env.REPORT_DIR;
if (!reportDir) {
  console.error("REPORT_DIR is required.");
  process.exit(1);
}

type ReportEntry = {
  timestamp: string;
  targetUrl: string;
  generatedAt: string;
  summaryPath: string;
  flowPath: string;
};

type ReportsIndex = {
  reports: ReportEntry[];
};

const docsReportsDir = path.join("docs", "reports");
ensureDir(docsReportsDir);

const timestamp = path.basename(reportDir);
const destDir = path.join(docsReportsDir, timestamp);
const latestDir = path.join(docsReportsDir, "latest");

const ignoreFiles = new Set(["auth_cookies.json"]);

function copyDir(source: string, destination: string) {
  ensureDir(destination);
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (ignoreFiles.has(entry.name)) {
      continue;
    }
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
if (fs.existsSync(latestDir)) {
  fs.rmSync(latestDir, { recursive: true, force: true });
}

copyDir(reportDir, destDir);
copyDir(reportDir, latestDir);

const meta = readJson(path.join(reportDir, "meta.json"), { targetUrl: "", startedAt: new Date().toISOString() });

const indexPath = path.join(docsReportsDir, "index.json");
const indexData = readJson<ReportsIndex>(indexPath, { reports: [] });

const entry = {
  timestamp,
  targetUrl: meta.targetUrl ?? "",
  generatedAt: meta.startedAt ?? new Date().toISOString(),
  summaryPath: `./reports/${timestamp}/summary.md`,
  flowPath: `./reports/${timestamp}/flow.html`
};

const filtered = (indexData.reports ?? []).filter((item) => item.timestamp !== timestamp);
indexData.reports = [entry, ...filtered].slice(0, 50);

writeJson(indexPath, indexData);

const latestIndex = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Latest Report</title>
    <style>
      body { font-family: "Spline Sans", Arial, sans-serif; padding: 24px; background: #f4f1ec; }
      a { color: #0a8f7b; font-weight: 600; text-decoration: none; }
      .card { background: #fff; padding: 20px; border-radius: 16px; border: 1px solid #e0d7cc; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Latest Process Flow</h1>
      <p>Generated for ${meta.targetUrl ?? "unknown target"}.</p>
      <p><a href="./flow.html">View flow diagram</a></p>
      <p><a href="./summary.md">Read summary</a></p>
    </div>
  </body>
</html>`;

fs.writeFileSync(path.join(latestDir, "index.html"), latestIndex);
