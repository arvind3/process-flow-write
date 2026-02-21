import { describe, expect, it } from "vitest";
import { buildFlowArtifacts, type PageContext } from "../scripts/build_flow";

describe("buildFlowArtifacts", () => {
  it("creates summary and mermaid flow sections", () => {
    const pages: PageContext[] = [
      {
        url: "https://example.com/",
        title: "Home",
        navItems: [{ text: "Shop", href: "/shop" }],
        links: ["https://example.com/login", "https://example.com/cart"]
      },
      {
        url: "https://example.com/login",
        title: "Login",
        hasPasswordInput: true,
        links: ["https://example.com/dashboard"]
      },
      {
        url: "https://example.com/cart",
        title: "Cart",
        links: []
      }
    ];

    const { summary, mermaid, flowMeta } = buildFlowArtifacts({
      targetUrl: "https://example.com",
      pages,
      uxCounts: {
        missingTitlePages: 0,
        multipleH1Pages: 0,
        imagesMissingAlt: 0,
        buttonsMissingLabel: 0,
        brokenLinks: 0
      },
      generatedAt: "2026-02-21T00:00:00.000Z"
    });

    expect(summary).toContain("Login flow");
    expect(summary).toContain("Checkout flow");
    expect(mermaid).toContain("subgraph Auth");
    expect(mermaid).toContain("subgraph Checkout");
    expect(flowMeta.nodeCount).toBe(3);
  });
});
