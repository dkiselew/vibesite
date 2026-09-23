import { describe, expect, it } from "vitest";
import { prepareHtml } from "../src/html";
import { MAX_HTML_BYTES } from "../src/config";

describe("prepareHtml", () => {
  it("rejects whitespace", () => {
    const result = prepareHtml("cv", " \n\t ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("invalid_html");
  });

  it("wraps a fragment and keeps author script", () => {
    const result = prepareHtml("cv", "<p>Hello</p><script>console.log(1)</script>");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContain("<html");
    expect(result.value).toContain("<title>cv</title>");
    expect(result.value).toContain("<script>console.log(1)</script>");
  });

  it("stores a full document unchanged", () => {
    const html = "<!DOCTYPE html><html><head></head><body><script>keep</script></body></html>";
    const result = prepareHtml("cv", html);
    expect(result).toEqual({ ok: true, value: html });
  });

  it("rejects html over 2 MiB", () => {
    const result = prepareHtml("cv", `<html>${"a".repeat(MAX_HTML_BYTES)}</html>`);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("limit_exceeded");
  });
});
