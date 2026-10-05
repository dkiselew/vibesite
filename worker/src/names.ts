import { appError, messages, type Result } from "./errors";

const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function normalizeDocumentName(input: unknown): Result<string> {
  if (typeof input !== "string") {
    return {
      ok: false,
      error: appError("invalid_name", messages.invalidName, 400),
    };
  }

  let name = input.trim().toLowerCase();
  if (name.endsWith(".md")) {
    name = name.slice(0, -".md".length);
  } else if (name.endsWith(".html")) {
    name = name.slice(0, -".html".length);
  }

  if (name.length < 1 || name.length > 64 || !NAME_PATTERN.test(name)) {
    return {
      ok: false,
      error: appError("invalid_name", messages.invalidName, 400),
    };
  }

  return { ok: true, value: name };
}
