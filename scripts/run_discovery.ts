import { chromium } from "playwright";
import path from "node:path";
import { execSync } from "node:child_process";
import { ensureDir, filterSameOrigin, sleep, timestamp, writeJson } from "./lib.js";

const targetUrl = process.env.TARGET_URL;
if (!targetUrl) {
  console.error("TARGET_URL is required.");
  process.exit(1);
}

const reportDir = process.env.REPORT_DIR ?? path.join("reports", timestamp());
const maxDepth = Number(process.env.CRAWL_DEPTH ?? 3);
const respectRobots = (process.env.RESPECT_ROBOTS ?? "true") === "true";
const authenticated = (process.env.AUTHENTICATED ?? "false") === "true";

ensureDir(reportDir);

const meta = {
  targetUrl,
  reportDir,
  startedAt: new Date().toISOString(),
  options: {
    maxDepth,
    respectRobots,
    authenticated
  }
};

writeJson(path.join(reportDir, "meta.json"), meta);

async function getAuthCookies() {
  const loginUrl = process.env.LOGIN_URL;
  const username = process.env.ZAP_USER;
  const password = process.env.ZAP_PASS;
  const userField = process.env.USER_FIELD;
  const passField = process.env.PASS_FIELD;
  const submitSelector = process.env.SUBMIT_SELECTOR;
  const loggedInPattern = process.env.LOGGED_IN_URL_PATTERN;

  if (!loginUrl || !username || !password || !userField || !passField || !submitSelector) {
    console.warn("Authenticated crawl requested, but required secrets are missing. Falling back to public crawl.");
    return null;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.fill(userField, username);
    await page.fill(passField, password);
    await page.click(submitSelector);
    if (loggedInPattern) {
      await page.waitForURL(loggedInPattern, { timeout: 30000 }).catch(() => undefined);
    }
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

    const cookies = await context.cookies();
    writeJson(path.join(reportDir, "auth_cookies.json"), { cookies });
    return cookies;
  } finally {
    await browser.close();
  }
}

function writeFallbackUrls(reason: string) {
  writeJson(path.join(reportDir, "urls.json"), {
    targetUrl,
    generatedAt: new Date().toISOString(),
    counts: {
      total: 1,
      sameOrigin: 1
    },
    urls: [{ url: targetUrl, source: "fallback" }],
    forms: [],
    links: [],
    error: reason
  });
}

async function main() {
  let cookieHeader = "";
  if (authenticated) {
    const cookies = await getAuthCookies();
    if (cookies && cookies.length) {
      cookieHeader = cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
    }
  }

  try {
    execSync("docker info", { stdio: "ignore" });
  } catch {
    console.warn("Docker is not available. Writing fallback URLs only.");
    writeFallbackUrls("docker_unavailable");
    return;
  }

  const zapPort = process.env.ZAP_PORT ?? "8090";
  const containerName = `zap-${Date.now()}`;
  const workspace = process.cwd().replace(/\\/g, "/");
  const volume = `${workspace}:/zap/wrk/:rw`;
  let containerStarted = false;

  const zapArgs = [
    "docker run -d",
    `--name ${containerName}`,
    `-p ${zapPort}:8090`,
    "-u zap",
    `-v ${volume}`,
    "owasp/zap2docker-stable",
    "zap.sh -daemon -host 0.0.0.0 -port 8090",
    "-config api.disablekey=true",
    `-config spider.parseRobotsTxt=${respectRobots}`,
    `-config spider.maxDepth=${maxDepth}`
  ];

  try {
    execSync(zapArgs.join(" "), { stdio: "inherit" });
    containerStarted = true;

    const zapBase = `http://localhost:${zapPort}`;

    let ready = false;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      try {
        const response = await fetch(`${zapBase}/JSON/core/view/version/`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        // ignore
      }
      await sleep(1000);
    }

    if (!ready) {
      throw new Error("ZAP API did not become ready.");
    }

    if (cookieHeader) {
      const replaceUrl = `${zapBase}/JSON/replacer/action/addRule/?description=authcookie&enabled=true&matchType=REQ_HEADER&matchRegex=false&matchString=Cookie&replacement=${encodeURIComponent(cookieHeader)}`;
      await fetch(replaceUrl);
    }

    const spiderUrl = `${zapBase}/JSON/spider/action/scan/?url=${encodeURIComponent(targetUrl)}&maxDepth=${maxDepth}&subtreeOnly=true`;
    const spiderResponse = await fetch(spiderUrl);
    const spiderData = await spiderResponse.json();
    const scanId = spiderData.scan;

    let spiderDone = false;
    while (!spiderDone) {
      await sleep(2000);
      const statusRes = await fetch(`${zapBase}/JSON/spider/view/status/?scanId=${scanId}`);
      const statusData = await statusRes.json();
      spiderDone = statusData.status === "100";
    }

    const ajaxUrl = `${zapBase}/JSON/ajaxSpider/action/scan/?url=${encodeURIComponent(targetUrl)}`;
    await fetch(ajaxUrl);

    let ajaxDone = false;
    while (!ajaxDone) {
      await sleep(3000);
      const statusRes = await fetch(`${zapBase}/JSON/ajaxSpider/view/status/`);
      const statusData = await statusRes.json();
      ajaxDone = statusData.status === "stopped";
    }

    const coreUrlsRes = await fetch(`${zapBase}/JSON/core/view/urls/`);
    const coreUrlsData = await coreUrlsRes.json();
    const coreUrls = coreUrlsData.urls ?? [];

    const spiderResultsRes = await fetch(`${zapBase}/JSON/spider/view/results/?scanId=${scanId}`);
    const spiderResultsData = await spiderResultsRes.json();
    const spiderUrls = spiderResultsData.results ?? [];

    const urls = Array.from(new Set([...coreUrls, ...spiderUrls]));
    const filtered = filterSameOrigin(urls, targetUrl);

    writeJson(path.join(reportDir, "urls.json"), {
      targetUrl,
      generatedAt: new Date().toISOString(),
      counts: {
        total: urls.length,
        sameOrigin: filtered.length
      },
      urls: filtered.map((url) => ({ url, source: "zap" })),
      forms: [],
      links: []
    });
  } catch (error) {
    console.error("Discovery failed:", error instanceof Error ? error.message : error);
    writeFallbackUrls("zap_failed");
  } finally {
    if (containerStarted) {
      try {
        execSync(`docker rm -f ${containerName}`, { stdio: "inherit" });
      } catch {
        // ignore cleanup errors
      }
    }
  }
}

main().catch((error) => {
  console.error("Discovery failed:", error instanceof Error ? error.message : error);
  writeFallbackUrls("unexpected_error");
});
