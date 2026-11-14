import { Marked } from "marked";
import { MAX_HTML_BYTES } from "../config";
import { appError, messages, type Result } from "../errors";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeUrl(href: string): string | null {
  const trimmed = href.trim();
  if (!trimmed) return null;
  const protocol = trimmed.replace(/[\u0000-\u0020]+/g, "").toLowerCase();
  if (protocol.startsWith("javascript:") || protocol.startsWith("vbscript:")) return null;
  return trimmed;
}

const marked = new Marked();
marked.use({
  gfm: true,
  renderer: {
    html({ text }) {
      return escapeHtml(text);
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      const hrefValue = safeUrl(href);
      if (!hrefValue) return text;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(hrefValue)}"${titleAttr}>${text}</a>`;
    },
    image({ href, title, text }) {
      const hrefValue = safeUrl(href);
      const alt = escapeHtml(text);
      if (!hrefValue) return alt;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${escapeHtml(hrefValue)}" alt="${alt}"${titleAttr}>`;
    },
  },
});

const PAGE_STYLE = `body {
  margin: 0;
  font-family: system-ui, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  background: #fff;
}
main {
  max-width: 42rem;
  margin: 0 auto;
  padding: 2.5rem 1.25rem 4rem;
}
h1, h2, h3, h4 {
  line-height: 1.25;
}
pre, code {
  font-family: ui-monospace, monospace;
}
pre {
  overflow: auto;
  padding: 0.9rem 1rem;
  background: #f4f4f5;
  border-radius: 6px;
}
code {
  font-size: 0.92em;
}
:not(pre) > code {
  padding: 0.1em 0.35em;
  background: #f4f4f5;
  border-radius: 4px;
}
blockquote {
  margin: 1rem 0;
  padding-left: 1rem;
  border-left: 3px solid #d4d4d8;
  color: #3f3f46;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th, td {
  border: 1px solid #e4e4e7;
  padding: 0.4rem 0.6rem;
  text-align: left;
}
img {
  max-width: 100%;
  height: auto;
}
a {
  color: #1d4ed8;
}`;

function documentTitle(markdown: string, name: string): string {
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^#\s+(.+?)\s*#*\s*$/.exec(trimmed);
    if (!match) continue;
    const plain = match[1].replace(/`([^`]*)`/g, "$1").replace(/[*_~]/g, "").trim();
    if (plain) return plain;
  }
  return name;
}

export function isMarkdownUpload(name: unknown, contentType: string | null | undefined): boolean {
  if (typeof contentType === "string" && /^text\/markdown\b/i.test(contentType.trim())) {
    return true;
  }
  return typeof name === "string" && name.trim().toLowerCase().endsWith(".md");
}

export function renderMarkdown(name: string, markdown: string): Result<string> {
  if (markdown.trim().length === 0) {
    return {
      ok: false,
      error: appError("invalid_html", messages.invalidHtml, 400),
    };
  }

  const body = marked.parse(markdown, { async: false });
  const page = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(documentTitle(markdown, name))}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
${PAGE_STYLE}
</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>
`;

  const bytes = new TextEncoder().encode(page).byteLength;
  if (bytes > MAX_HTML_BYTES) {
    return {
      ok: false,
      error: appError("limit_exceeded", messages.limitBytes, 413),
    };
  }

  return { ok: true, value: page };
}
