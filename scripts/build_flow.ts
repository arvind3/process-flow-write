import fs from "node:fs";
import path from "node:path";
import { readJson, writeJson } from "./lib.js";

const reportDir = process.env.REPORT_DIR ?? path.join("reports", "latest");

const urlsData = readJson(path.join(reportDir, "urls.json"), { targetUrl: "", urls: [] });
const pagesData = readJson(path.join(reportDir, "pages.json"), { pages: [] });
const uxData = readJson(path.join(reportDir, "ux_checks.json"), { counts: {} });

const targetUrl = urlsData.targetUrl || pagesData.targetUrl || "";
const pages = pagesData.pages ?? [];

const normalize = (value: string) => value.toLowerCase();
const hasKeyword = (value: string, keywords: string[]) => keywords.some((keyword) => normalize(value).includes(keyword));

const loginPages = pages.filter((page: any) => page.hasPasswordInput || page.loginDetected || hasKeyword(page.url, ["login", "signin", "sign-in"]));
const checkoutPages = pages.filter((page: any) => hasKeyword(page.url + " " + (page.title ?? ""), ["cart", "checkout", "payment", "order", "basket"]));
const accountPages = pages.filter((page: any) => hasKeyword(page.url + " " + (page.title ?? ""), ["account", "profile", "settings", "dashboard"]));
const searchPages = pages.filter((page: any) => page.hasSearchInput || hasKeyword(page.url + " " + (page.title ?? ""), ["search"]));

const navSeeds = pages
  .flatMap((page: any) => page.navItems ?? [])
  .map((item: any) => item.text)
  .filter(Boolean);

const uniqueNav = Array.from(new Set(navSeeds)).slice(0, 6);

const summaryLines: string[] = [];
summaryLines.push("# Process Flow Summary");
summaryLines.push("");
summaryLines.push(`Target: ${targetUrl || "Unknown"}`);
summaryLines.push(`Generated: ${new Date().toISOString()}`);
summaryLines.push("");
summaryLines.push("## Main Flows");
summaryLines.push(`- Public navigation: Home -> ${uniqueNav.length ? uniqueNav.join(" -> ") : "Primary pages"}`);
if (loginPages.length) {
  summaryLines.push("- Login flow: Home -> Login -> Post-login landing");
}
if (checkoutPages.length) {
  summaryLines.push("- Checkout flow: Browse -> Product -> Cart -> Checkout");
}
if (searchPages.length) {
  summaryLines.push("- Search flow: Search -> Results -> Detail");
}
if (accountPages.length) {
  summaryLines.push("- Account flow: Account -> Settings");
}
summaryLines.push("");
summaryLines.push("## Site Map");
summaryLines.push(`- Pages discovered: ${pages.length}`);
summaryLines.push(`- Login-related pages: ${loginPages.length}`);
summaryLines.push(`- Checkout-related pages: ${checkoutPages.length}`);
summaryLines.push(`- Account-related pages: ${accountPages.length}`);
summaryLines.push("");
summaryLines.push("## UX Checks");
summaryLines.push(`- Missing title pages: ${uxData.counts?.missingTitlePages ?? 0}`);
summaryLines.push(`- Multiple H1 pages: ${uxData.counts?.multipleH1Pages ?? 0}`);
summaryLines.push(`- Images missing alt: ${uxData.counts?.imagesMissingAlt ?? 0}`);
summaryLines.push(`- Buttons missing label: ${uxData.counts?.buttonsMissingLabel ?? 0}`);
summaryLines.push(`- Broken links (sample): ${uxData.counts?.brokenLinks ?? 0}`);
summaryLines.push("");
summaryLines.push("## Report Files");
summaryLines.push("- Flow diagram: flow.html");
summaryLines.push("- Mermaid source: flow.mmd");
summaryLines.push("- URLs: urls.json");
summaryLines.push("- Page context: pages.json");
summaryLines.push("- Screenshots: screenshots/");

fs.writeFileSync(path.join(reportDir, "summary.md"), summaryLines.join("\n"));

const nodes = pages.map((page: any, index: number) => {
  const label = (page.title && page.title.trim()) || page.url;
  return {
    id: `p${index + 1}`,
    url: page.url,
    label: label.replace(/"/g, "'")
  };
});

const urlToId = new Map(nodes.map((node) => [node.url, node.id]));

const edges: string[] = [];
for (const page of pages) {
  const fromId = urlToId.get(page.url);
  if (!fromId) continue;
  const links: string[] = page.links ?? [];
  for (const link of links) {
    const toId = urlToId.get(link);
    if (toId) {
      edges.push(`${fromId} --> ${toId}`);
    }
  }
}

const limitedEdges = Array.from(new Set(edges)).slice(0, 120);

const mermaid: string[] = [];
mermaid.push("flowchart LR");
mermaid.push("  subgraph Public");
for (const node of nodes) {
  const isLogin = loginPages.some((page: any) => page.url === node.url);
  const isCheckout = checkoutPages.some((page: any) => page.url === node.url);
  const isAccount = accountPages.some((page: any) => page.url === node.url);
  if (!isLogin && !isCheckout && !isAccount) {
    mermaid.push(`    ${node.id}[\"${node.label}\"]`);
  }
}
mermaid.push("  end");

if (loginPages.length) {
  mermaid.push("  subgraph Auth");
  for (const node of nodes) {
    if (loginPages.some((page: any) => page.url === node.url)) {
      mermaid.push(`    ${node.id}[\"${node.label}\"]`);
    }
  }
  mermaid.push("  end");
}

if (checkoutPages.length) {
  mermaid.push("  subgraph Checkout");
  for (const node of nodes) {
    if (checkoutPages.some((page: any) => page.url === node.url)) {
      mermaid.push(`    ${node.id}[\"${node.label}\"]`);
    }
  }
  mermaid.push("  end");
}

if (accountPages.length) {
  mermaid.push("  subgraph Account");
  for (const node of nodes) {
    if (accountPages.some((page: any) => page.url === node.url)) {
      mermaid.push(`    ${node.id}[\"${node.label}\"]`);
    }
  }
  mermaid.push("  end");
}

for (const edge of limitedEdges) {
  mermaid.push(`  ${edge}`);
}

fs.writeFileSync(path.join(reportDir, "flow.mmd"), mermaid.join("\n"));

writeJson(path.join(reportDir, "flow_meta.json"), {
  targetUrl,
  generatedAt: new Date().toISOString(),
  nodeCount: nodes.length,
  edgeCount: limitedEdges.length
});
