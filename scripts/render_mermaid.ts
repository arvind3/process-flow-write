import fs from "node:fs";
import path from "node:path";

const reportDir = process.env.REPORT_DIR ?? path.join("reports", "latest");
const flowPath = path.join(reportDir, "flow.mmd");

if (!fs.existsSync(flowPath)) {
  console.error("flow.mmd not found.");
  process.exit(1);
}

const flowContent = fs.readFileSync(flowPath, "utf-8");
const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Process Flow</title>
    <style>
      body { font-family: "Spline Sans", Arial, sans-serif; padding: 24px; background: #f4f1ec; }
      .mermaid { background: #fff; padding: 24px; border-radius: 16px; box-shadow: 0 10px 30px -20px rgba(0,0,0,0.2); }
    </style>
    <script type="module">
      import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs";
      mermaid.initialize({ startOnLoad: true, theme: "default" });
    </script>
  </head>
  <body>
    <pre class="mermaid">${escapeHtml(flowContent)}</pre>
  </body>
</html>`;

fs.writeFileSync(path.join(reportDir, "flow.html"), html);
