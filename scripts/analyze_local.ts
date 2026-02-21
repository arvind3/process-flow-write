import path from "node:path";
import { execSync } from "node:child_process";
import { timestamp } from "./lib.js";

const targetUrl = process.env.TARGET_URL;
if (!targetUrl) {
  console.error("TARGET_URL is required. Example: $env:TARGET_URL=\"https://example.com\"");
  process.exit(1);
}

const reportDir = process.env.REPORT_DIR ?? path.join("reports", timestamp());
const env = { ...process.env, REPORT_DIR: reportDir };

const run = (command: string) => {
  execSync(command, { stdio: "inherit", env });
};

run("npx tsx scripts/run_discovery.ts");
run("npx tsx scripts/run_playwright.ts");
run("npx tsx scripts/build_flow.ts");
run("npx tsx scripts/render_mermaid.ts");
run("npx tsx scripts/publish_reports.ts");
