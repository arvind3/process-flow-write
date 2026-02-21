import fs from "node:fs";
import path from "node:path";
import { ensureDir, readJson, writeJson } from "./lib.js";

const reportDir = process.env.REPORT_DIR;
if (!reportDir) {
  console.error("REPORT_DIR is required.");
  process.exit(1);
}

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

copyDir(reportDir, destDir);
copyDir(reportDir, latestDir);

const meta = readJson(path.join(reportDir, "meta.json"), { targetUrl: "", startedAt: new Date().toISOString() });

const indexPath = path.join(docsReportsDir, "index.json");
const indexData = readJson(indexPath, { reports: [] as any[] });

const entry = {
  timestamp,
  targetUrl: meta.targetUrl ?? "",
  generatedAt: meta.startedAt ?? new Date().toISOString(),
  summaryPath: `./reports/${timestamp}/summary.md`,
  flowPath: `./reports/${timestamp}/flow.html`
};

const filtered = (indexData.reports ?? []).filter((item: any) => item.timestamp !== timestamp);
indexData.reports = [entry, ...filtered].slice(0, 50);

writeJson(indexPath, indexData);
