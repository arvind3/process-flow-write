import path from "node:path";
import { chromium } from "playwright";
import { ensureDir, filterSameOrigin, readJson, safeUrlFilename, toAbsoluteUrl, writeJson } from "./lib.js";

const targetUrl = process.env.TARGET_URL;
if (!targetUrl) {
  console.error("TARGET_URL is required.");
  process.exit(1);
}

const reportDir = process.env.REPORT_DIR ?? path.join("reports", "latest");
const maxPages = Number(process.env.MAX_PAGES ?? 50);

const urlsPath = path.join(reportDir, "urls.json");
const urlsData = readJson(urlsPath, { urls: [] as { url: string }[] });
let urls = urlsData.urls.map((entry: { url: string }) => entry.url);
if (!urls.length) {
  urls = [targetUrl];
}

urls = Array.from(new Set(filterSameOrigin(urls, targetUrl))).slice(0, maxPages);

const screenshotsDir = path.join(reportDir, "screenshots");
ensureDir(screenshotsDir);

const cookiesPath = path.join(reportDir, "auth_cookies.json");
const cookieData = readJson(cookiesPath, { cookies: [] as { name: string; value: string; domain: string; path: string }[] });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });

if (cookieData.cookies.length) {
  await context.addCookies(cookieData.cookies as any);
}

const pages: any[] = [];
let missingTitleCount = 0;
let multiH1Count = 0;
let imagesMissingAlt = 0;
let buttonsMissingLabel = 0;
const brokenLinks: { url: string; status: number }[] = [];

const fetchWithTimeout = async (url: string, options: RequestInit, timeoutMs = 8000) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
};

for (const url of urls) {
  const page = await context.newPage();
  let pageInfo: any = {
    url,
    error: null
  };

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    const data = await page.evaluate(() => {
      const text = (value: string | null) => (value ?? "").trim();
      const lower = (value: string) => value.toLowerCase();
      const ctaKeywords = ["get started", "buy", "checkout", "sign up", "start", "contact", "book", "subscribe", "request demo"];

      const headings = {
        h1: Array.from(document.querySelectorAll("h1")).map((el) => text(el.textContent)).filter(Boolean),
        h2: Array.from(document.querySelectorAll("h2")).map((el) => text(el.textContent)).filter(Boolean)
      };

      const navItems = Array.from(document.querySelectorAll("nav a"))
        .map((el) => ({ text: text(el.textContent), href: el.getAttribute("href") ?? "" }))
        .filter((item) => item.text || item.href);

      const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']"))
        .map((el) => {
          const button = el as HTMLButtonElement;
          const label = text(button.textContent) || text(button.getAttribute("value")) || text(button.getAttribute("aria-label"));
          return { text: label, selector: button.tagName.toLowerCase() };
        })
        .filter((btn) => btn.text);

      const ctaButtons = buttons.filter((button) => ctaKeywords.some((keyword) => lower(button.text).includes(keyword)));

      const forms = Array.from(document.querySelectorAll("form")).map((form) => {
        const fields = Array.from(form.querySelectorAll("input, select, textarea")).map((field) => {
          const input = field as HTMLInputElement;
          return {
            name: input.name || input.id || input.getAttribute("aria-label") || "field",
            type: input.type || input.tagName.toLowerCase(),
            placeholder: input.getAttribute("placeholder") || ""
          };
        });
        return { fields };
      });

      const links = Array.from(document.querySelectorAll("a"))
        .map((el) => el.getAttribute("href") || "")
        .filter(Boolean);

      const title = text(document.title);
      const hasPasswordInput = Boolean(document.querySelector("input[type='password']"));
      const hasSearchInput = Boolean(document.querySelector("input[type='search'], input[placeholder*='search' i]"));

      const missingTitle = !title;
      const h1Count = headings.h1.length;
      const imagesMissingAlt = Array.from(document.querySelectorAll("img")).filter((img) => {
        const alt = img.getAttribute("alt");
        return !alt || !alt.trim();
      }).length;
      const buttonsMissingLabel = Array.from(document.querySelectorAll("button, input[type='submit'], input[type='button']")).filter((el) => {
        const label = text(el.textContent) || text(el.getAttribute("value")) || text(el.getAttribute("aria-label")) || text(el.getAttribute("aria-labelledby"));
        return !label;
      }).length;

      const landmarks = {
        header: Boolean(document.querySelector("header")),
        main: Boolean(document.querySelector("main, #main, [role='main']")),
        footer: Boolean(document.querySelector("footer"))
      };

      return {
        title,
        headings,
        navItems,
        buttons,
        ctaButtons,
        forms,
        links,
        landmarks,
        hasPasswordInput,
        hasSearchInput,
        missingTitle,
        h1Count,
        imagesMissingAlt,
        buttonsMissingLabel
      };
    });

    const finalUrl = page.url();
    const loginDetected = data.hasPasswordInput || /login|signin|sign-in/i.test(finalUrl);

    const screenshotName = `${safeUrlFilename(url)}.png`;
    const screenshotPath = path.join(screenshotsDir, screenshotName);
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

    pageInfo = {
      ...pageInfo,
      ...data,
      finalUrl,
      loginDetected,
      links: data.links.map((link: string) => toAbsoluteUrl(link, url)),
      screenshot: `screenshots/${screenshotName}`
    };

    if (data.missingTitle) {
      missingTitleCount += 1;
    }
    if (data.h1Count > 1) {
      multiH1Count += 1;
    }
    imagesMissingAlt += data.imagesMissingAlt;
    buttonsMissingLabel += data.buttonsMissingLabel;
  } catch (error) {
    pageInfo.error = error instanceof Error ? error.message : String(error);
  } finally {
    pages.push(pageInfo);
    await page.close();
  }
}

await browser.close();

const linkSample = pages
  .flatMap((page) => page.links ?? [])
  .filter((link: string) => link.startsWith("http"));

const sampleSet = Array.from(new Set(linkSample)).slice(0, 30);
for (const link of sampleSet) {
  try {
    const response = await fetchWithTimeout(link, { method: "HEAD", redirect: "follow" });
    if (response.status >= 400) {
      brokenLinks.push({ url: link, status: response.status });
    }
  } catch {
    try {
      const response = await fetchWithTimeout(link, { method: "GET", redirect: "follow" });
      if (response.status >= 400) {
        brokenLinks.push({ url: link, status: response.status });
      }
    } catch {
      brokenLinks.push({ url: link, status: 0 });
    }
  }
}

writeJson(path.join(reportDir, "pages.json"), {
  targetUrl,
  generatedAt: new Date().toISOString(),
  count: pages.length,
  pages
});

writeJson(path.join(reportDir, "ux_checks.json"), {
  targetUrl,
  generatedAt: new Date().toISOString(),
  counts: {
    missingTitlePages: missingTitleCount,
    multipleH1Pages: multiH1Count,
    imagesMissingAlt,
    buttonsMissingLabel,
    brokenLinks: brokenLinks.length
  },
  brokenLinks
});
