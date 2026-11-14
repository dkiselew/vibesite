import { MAX_HTML_BYTES } from "../config";
import { appError, messages, type Result } from "../errors";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function wrapFragment(name: string, fragment: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${fragment}
</body>
</html>
`;
}

export function prepareHtml(name: string, html: string): Result<string> {
  if (html.trim().length === 0) {
    return {
      ok: false,
      error: appError("invalid_html", messages.invalidHtml, 400),
    };
  }

  const stored = /<html[\s>]/i.test(html) ? html : wrapFragment(name, html);
  const bytes = new TextEncoder().encode(stored).byteLength;
  if (bytes > MAX_HTML_BYTES) {
    return {
      ok: false,
      error: appError("limit_exceeded", messages.limitBytes, 413),
    };
  }

  return { ok: true, value: stored };
}
