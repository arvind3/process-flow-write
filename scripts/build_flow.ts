import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readJson, writeJson } from "./lib.js";

export type NavItem = {
  text: string;
  href?: string;
};

export type PageContext = {
  url: string;
  title?: string;
  navItems?: NavItem[];
  links?: string[];
  hasPasswordInput?: boolean;
  loginDetected?: boolean;
  hasSearchInput?: boolean;
};

export type UxCounts = {
  missingTitlePages?: number;
  multipleH1Pages?: number;
  imagesMissingAlt?: number;
  buttonsMissingLabel?: number;
  brokenLinks?: number;
};

type UrlsData = {
  targetUrl?: string;
  urls?: { url: string }[];
};

type PagesData = {
  targetUrl?: string;
  pages?: PageContext[];
};

type UxData = {
  counts?: UxCounts;
};

type FlowNode = {
  id: string;
  url: string;
  label: string;
};

type FlowArtifacts = {
  summary: string;
  mermaid: string;
  flowMeta: {
    targetUrl: string;
    generatedAt: string;
    nodeCount: number;
    edgeCount: number;
  };
  nodes: FlowNode[];
  edges: string[];
};

const normalize = (value: string) => value.toLowerCase();
const hasKeyword = (value: string, keywords: string[]) => keywords.some((keyword) => normalize(value).includes(keyword));

export function buildFlowArtifacts({
  targetUrl,
  pages,
  uxCounts,
  generatedAt = new Date().toISOString()
}: {
  targetUrl: string;
  pages: PageContext[];
  uxCounts?: UxCounts;
  generatedAt?: string;
}): FlowArtifacts {
  const loginPages = pages.filter(
    (page) => page.hasPasswordInput || page.loginDetected || hasKeyword(page.url, ["login", "signin", "sign-in"])
  );
  const checkoutPages = pages.filter((page) =>
    hasKeyword(`${page.url} ${(page.title ?? "").toString()}`, ["cart", "checkout", "payment", "order", "basket"])
  );
  const accountPages = pages.filter((page) =>
    hasKeyword(`${page.url} ${(page.title ?? "").toString()}`, ["account", "profile", "settings", "dashboard"])
  );
  const searchPages = pages.filter(
    (page) => page.hasSearchInput || hasKeyword(`${page.url} ${(page.title ?? "").toString()}`, ["search"])
  );

  const navSeeds = pages
    .flatMap((page) => page.navItems ?? [])
    .map((item) => item.text)
    .filter((text) => Boolean(text));

  const uniqueNav = Array.from(new Set(navSeeds)).slice(0, 6);

  const summaryLines: string[] = [];
  summaryLines.push("# Process Flow Summary");
  summaryLines.push("");
  summaryLines.push(`Target: ${targetUrl || "Unknown"}`);
  summaryLines.push(`Generated: ${generatedAt}`);
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
  summaryLines.push(`- Missing title pages: ${uxCounts?.missingTitlePages ?? 0}`);
  summaryLines.push(`- Multiple H1 pages: ${uxCounts?.multipleH1Pages ?? 0}`);
  summaryLines.push(`- Images missing alt: ${uxCounts?.imagesMissingAlt ?? 0}`);
  summaryLines.push(`- Buttons missing label: ${uxCounts?.buttonsMissingLabel ?? 0}`);
  summaryLines.push(`- Broken links (sample): ${uxCounts?.brokenLinks ?? 0}`);
  summaryLines.push("");
  summaryLines.push("## Report Files");
  summaryLines.push("- Flow diagram: flow.html");
  summaryLines.push("- Mermaid source: flow.mmd");
  summaryLines.push("- URLs: urls.json");
  summaryLines.push("- Page context: pages.json");
  summaryLines.push("- Screenshots: screenshots/");

  const nodes = pages.map((page, index) => {
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
    const links = page.links ?? [];
    for (const link of links) {
      const toId = urlToId.get(link);
      if (toId) {
        edges.push(`${fromId} --> ${toId}`);
      }
    }
  }

  const limitedEdges = Array.from(new Set(edges)).slice(0, 120);

  const loginSet = new Set(loginPages.map((page) => page.url));
  const checkoutSet = new Set(checkoutPages.map((page) => page.url));
  const accountSet = new Set(accountPages.map((page) => page.url));

  const mermaid: string[] = [];
  mermaid.push("flowchart LR");
  mermaid.push("  subgraph Public");
  for (const node of nodes) {
    const isLogin = loginSet.has(node.url);
    const isCheckout = checkoutSet.has(node.url);
    const isAccount = accountSet.has(node.url);
    if (!isLogin && !isCheckout && !isAccount) {
      mermaid.push(`    ${node.id}["${node.label}"]`);
    }
  }
  mermaid.push("  end");

  if (loginPages.length) {
    mermaid.push("  subgraph Auth");
    for (const node of nodes) {
      if (loginSet.has(node.url)) {
        mermaid.push(`    ${node.id}["${node.label}"]`);
      }
    }
    mermaid.push("  end");
  }

  if (checkoutPages.length) {
    mermaid.push("  subgraph Checkout");
    for (const node of nodes) {
      if (checkoutSet.has(node.url)) {
        mermaid.push(`    ${node.id}["${node.label}"]`);
      }
    }
    mermaid.push("  end");
  }

  if (accountPages.length) {
    mermaid.push("  subgraph Account");
    for (const node of nodes) {
      if (accountSet.has(node.url)) {
        mermaid.push(`    ${node.id}["${node.label}"]`);
      }
    }
    mermaid.push("  end");
  }

  for (const edge of limitedEdges) {
    mermaid.push(`  ${edge}`);
  }

  return {
    summary: summaryLines.join("\n"),
    mermaid: mermaid.join("\n"),
    flowMeta: {
      targetUrl,
      generatedAt,
      nodeCount: nodes.length,
      edgeCount: limitedEdges.length
    },
    nodes,
    edges: limitedEdges
  };
}

function main() {
  const reportDir = process.env.REPORT_DIR ?? path.join("reports", "latest");

  const urlsData = readJson<UrlsData>(path.join(reportDir, "urls.json"), { targetUrl: "", urls: [] });
  const pagesData = readJson<PagesData>(path.join(reportDir, "pages.json"), { pages: [] });
  const uxData = readJson<UxData>(path.join(reportDir, "ux_checks.json"), { counts: {} });

  const targetUrl = urlsData.targetUrl || pagesData.targetUrl || "";
  const pages = pagesData.pages ?? [];

  const { summary, mermaid, flowMeta } = buildFlowArtifacts({
    targetUrl,
    pages,
    uxCounts: uxData.counts ?? {},
    generatedAt: new Date().toISOString()
  });

  fs.writeFileSync(path.join(reportDir, "summary.md"), summary);
  fs.writeFileSync(path.join(reportDir, "flow.mmd"), mermaid);
  writeJson(path.join(reportDir, "flow_meta.json"), flowMeta);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
