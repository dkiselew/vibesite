import { describe, expect, it } from "vitest";
import { normalizeDocumentName } from "../src/names";

describe("normalizeDocumentName", () => {
  it("lowercases and strips one .html suffix", () => {
    expect(normalizeDocumentName("CV.HTML")).toEqual({ ok: true, value: "cv" });
    expect(normalizeDocumentName("  Incident-DB.html  ")).toEqual({
      ok: true,
      value: "incident-db",
    });
  });

  it("rejects a second .html suffix because the remaining dot is illegal", () => {
    expect(normalizeDocumentName("cv.html.html").ok).toBe(false);
  });

  it("rejects empty, dotted, underscored, and double-hyphen names", () => {
    for (const name of ["", "   ", "cv.html.html", "a_b", "a--b", "-cv", "cv-", "résumé", "a.b"]) {
      const result = normalizeDocumentName(name);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("invalid_name");
    }
  });

  it("rejects names longer than 64 characters", () => {
    expect(normalizeDocumentName("a".repeat(65)).ok).toBe(false);
    expect(normalizeDocumentName("a".repeat(64)).ok).toBe(true);
  });
});
