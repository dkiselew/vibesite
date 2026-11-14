import { Hono } from "hono";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/http/app";
import { actorFromRequest, createAuth, isActor, type Auth } from "../src/auth";
import { MAX_DOCUMENTS, type RuntimeConfig } from "../src/config";
import { createMemoryStore } from "./memory-store";
import { handleRequest, notFoundJson } from "../src/http/serve";

const HTML_V1 = `<!DOCTYPE html><html><body><h1>Version 1</h1><script>window.live=1</script></body></html>`;
const HTML_V2 = `<!DOCTYPE html><html><body><h1>Version 2</h1><script>window.live=2</script></body></html>`;

const config: RuntimeConfig = {
  URL_SCHEME: "http",
  HOST: "localhost:8787",
  BETTER_AUTH_URL: "http://localhost:5173",
};

type Harness = {
  auth: Auth;
  app: Hono;
  memory: ReturnType<typeof createMemoryStore>;
  cookie: string;
  organizationId: string;
  request: (input: string, init?: RequestInit & { auth?: boolean }) => Promise<Response>;
};

async function boot(): Promise<Harness> {
  const sqlite = new Database(":memory:");
  const auth = await createAuth({
    database: sqlite,
    secret: "test-secret-test-secret-test-secret",
    baseURL: config.BETTER_AUTH_URL,
  });
  const memory = createMemoryStore();
  const app = createApp({ auth, store: memory.store, config });
  const signed = await auth.api.signUpEmail({
    body: { name: "Demo", email: "demo@example.com", password: "password-123" },
    asResponse: true,
  });
  if (!signed.ok) {
    throw new Error(await signed.text());
  }
  const cookies =
    typeof signed.headers.getSetCookie === "function"
      ? signed.headers.getSetCookie()
      : [signed.headers.get("set-cookie") ?? ""];
  const cookie = cookies.map((item) => item.split(";")[0]).filter(Boolean).join("; ");
  const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
  const organizationId = session?.session.activeOrganizationId ?? "";
  if (!organizationId) throw new Error("Signup did not select a folder.");

  return {
    auth,
    app,
    memory,
    cookie,
    organizationId,
    request(input, init) {
      const headers = new Headers(init?.headers);
      if (init?.auth !== false && !headers.has("cookie") && !headers.has("authorization")) {
        headers.set("cookie", cookie);
      }
      const request = new Request(input, { ...init, headers });
      return handleRequest(request, { auth, store: memory.store, config, app }).then(
        (response) => response ?? notFoundJson(),
      );
    },
  };
}

let env: Harness;

beforeEach(async () => {
  env = await boot();
});

async function rpc(
  method: string,
  params?: unknown,
  options?: { auth?: string | null; id?: number | null; omitId?: boolean },
) {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  });
  if (options?.auth === null) {
    // no credentials
  } else if (options?.auth) {
    headers.set("Authorization", options.auth);
  } else {
    headers.set("cookie", env.cookie);
  }
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (!options?.omitId) body.id = options?.id === undefined ? 1 : options.id;
  if (params !== undefined) body.params = params;
  const response = await env.request("http://localhost:8787/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    auth: false,
  });
  const text = await response.text();
  return {
    status: response.status,
    json: text ? (JSON.parse(text) as Record<string, unknown>) : null,
  };
}

function toolJson(payload: Record<string, unknown>): Record<string, unknown> {
  const result = payload.result as { content: { text: string }[]; isError?: boolean };
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe("stage 0 loop", () => {
  it("puts, lists, replaces in place, serves the script, then deletes to 404", async () => {
    const empty = await env.request("http://localhost:8787/api/documents", { method: "GET" });
    expect(empty.status).toBe(200);
    await expect(empty.json()).resolves.toEqual({
      workspace: "demo",
      origin: "http://demo.localhost:8787",
      documents: [],
    });

    const created = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "CV.HTML", html: HTML_V1 },
    });
    expect(created.status).toBe(200);
    const createdBody = toolJson(created.json!);
    expect(createdBody).toMatchObject({
      name: "cv",
      url: "http://demo.localhost:8787/cv",
      created: true,
    });
    expect(createdBody.id).toMatch(/^[0-9a-f-]{36}$/i);

    const listed = await rpc("tools/call", { name: "list_documents", arguments: {} });
    const listBody = toolJson(listed.json!) as {
      workspace: string;
      documents: { id: string; name: string; url: string }[];
    };
    expect(listBody.workspace).toBe("demo");
    expect(listBody.documents.map((doc) => doc.name)).toEqual(["cv"]);
    expect(listBody.documents[0].url).toBe("http://demo.localhost:8787/cv");
    expect(listBody.documents[0].id).toBe(createdBody.id);

    const replaced = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "cv", html: HTML_V2 },
    });
    expect(toolJson(replaced.json!).created).toBe(false);
    expect(toolJson(replaced.json!).url).toBe("http://demo.localhost:8787/cv");
    expect(toolJson(replaced.json!).id).toBe(createdBody.id);

    const fetched = await rpc("tools/call", { name: "get_document", arguments: { name: "cv" } });
    const fetchedBody = toolJson(fetched.json!) as { html: string };
    expect(fetchedBody.html).toContain("Version 2");
    expect(fetchedBody.html).toContain("<script>window.live=2</script>");

    const page = await env.request("http://demo.localhost:8787/cv");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("<script>window.live=2</script>");

    const root = await env.request("http://demo.localhost:8787/");
    expect(root.status).toBe(404);

    const removed = await rpc("tools/call", { name: "delete_document", arguments: { name: "cv" } });
    expect(toolJson(removed.json!)).toEqual({ deleted: "cv" });

    const after = await rpc("tools/call", { name: "list_documents", arguments: {} });
    expect(toolJson(after.json!)).toEqual({ workspace: "demo", documents: [] });

    const missing = await rpc("tools/call", { name: "get_document", arguments: { name: "cv" } });
    expect(toolJson(missing.json!).error).toMatchObject({ code: "not_found" });
    expect((missing.json!.result as { isError: boolean }).isError).toBe(true);

    const gone = await env.request("http://demo.localhost:8787/cv");
    expect(gone.status).toBe(404);

    const again = await rpc("tools/call", { name: "delete_document", arguments: { name: "cv" } });
    expect(toolJson(again.json!).error).toMatchObject({ code: "not_found" });
  });

  it("rejects a missing or wrong bearer key and does not write", async () => {
    const denied = await rpc(
      "tools/call",
      { name: "put_html_document", arguments: { name: "cv", html: HTML_V1 } },
      { auth: "Bearer wrong" },
    );
    expect(denied.status).toBe(401);
    expect(denied.json).toMatchObject({
      jsonrpc: "2.0",
      error: { message: "no token payload" },
    });
    const page = await env.request("http://demo.localhost:8787/cv");
    expect(page.status).toBe(404);
  });

  it("returns contract errors for empty html and a bad name", async () => {
    const empty = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "cv", html: "  " },
    });
    expect(toolJson(empty.json!).error).toMatchObject({ code: "invalid_html" });

    const bad = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "a--b", html: "<p>x</p>" },
    });
    expect(toolJson(bad.json!).error).toMatchObject({ code: "invalid_name" });

    const missing = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "cv" },
    });
    expect(toolJson(missing.json!).error).toMatchObject({ code: "bad_request" });
  });

  it("stops at 30 documents and still replaces an existing one", async () => {
    for (let i = 0; i < MAX_DOCUMENTS; i++) {
      const response = await rpc("tools/call", {
        name: "put_html_document",
        arguments: { name: `doc-${i}`, html: `<p>${i}</p>` },
      });
      expect(toolJson(response.json!).created).toBe(true);
    }
    const overflow = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "extra", html: "<p>no</p>" },
    });
    expect(toolJson(overflow.json!).error).toMatchObject({ code: "limit_exceeded" });
    const replaced = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "doc-0", html: "<p>replaced</p>" },
    });
    expect(toolJson(replaced.json!).created).toBe(false);
  });

  it("sorts list_documents by updated_at descending", async () => {
    await rpc("tools/call", { name: "put_html_document", arguments: { name: "older", html: "<p>old</p>" } });
    await rpc("tools/call", { name: "put_html_document", arguments: { name: "newer", html: "<p>new</p>" } });
    env.memory.setUploaded(env.organizationId, "older", new Date("2026-01-01T00:00:00.000Z"));
    env.memory.setUploaded(env.organizationId, "newer", new Date("2026-06-01T00:00:00.000Z"));
    const listed = await env.request("http://localhost:8787/api/documents", { method: "GET" });
    const body = (await listed.json()) as { documents: { name: string }[] };
    expect(body.documents.map((doc) => doc.name)).toEqual(["newer", "older"]);
  });

  it("serves the MCP protected resource metadata", async () => {
    const response = await env.request(
      "http://localhost:8787/.well-known/oauth-protected-resource/mcp",
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      resource: "http://localhost:5173/mcp",
      authorization_servers: ["http://localhost:5173/api/auth"],
    });
  });

  it("answers initialize and does not open an SSE session", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(init.status).toBe(200);
    expect(init.json).toMatchObject({
      result: { protocolVersion: "2025-03-26", serverInfo: { name: "webdocs" } },
    });
    const instructions = (init.json!.result as { instructions?: string }).instructions;
    expect(typeof instructions).toBe("string");
    expect(instructions!.length).toBeGreaterThan(0);
    const stream = await env.request("http://localhost:8787/mcp", { method: "GET" });
    expect(stream.status).toBe(405);
    const note = await rpc("notifications/initialized", {}, { omitId: true });
    expect(note.status).toBe(202);
    expect(note.json).toBeNull();
  });

  it("lists the six remote tools and not the removed write tools", async () => {
    const listed = await rpc("tools/list");
    const result = listed.json!.result as {
      tools: { name: string; inputSchema: { required?: string[] } }[];
    };
    expect(result.tools.map((tool) => tool.name)).toEqual([
      "list_documents",
      "put_markdown_document",
      "put_html_document",
      "get_document",
      "delete_document",
      "rename_document",
    ]);
    const required = Object.fromEntries(
      result.tools.map((tool) => [tool.name, tool.inputSchema.required ?? []]),
    );
    expect(required.put_markdown_document).toEqual(["name", "markdown"]);
    expect(required.put_html_document).toEqual(["name", "html"]);
  });

  it("renders markdown and stores HTML bytes even when the name ends in .md", async () => {
    const created = await rpc("tools/call", {
      name: "put_markdown_document",
      arguments: { name: "notes.md", markdown: "# Hello" },
    });
    expect(toolJson(created.json!)).toMatchObject({
      name: "notes",
      created: true,
      url: "http://demo.localhost:8787/notes",
    });
    const rendered = await rpc("tools/call", { name: "get_document", arguments: { name: "notes" } });
    const renderedHtml = (toolJson(rendered.json!) as { html: string }).html;
    expect(renderedHtml).toContain("<h1>");
    expect(renderedHtml).toContain("Hello");
    expect(renderedHtml).toContain("<main>");
    expect(renderedHtml).not.toContain("# Hello");

    const replaced = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "notes.md", html: "<p>raw</p>" },
    });
    expect(toolJson(replaced.json!).created).toBe(false);
    const stored = await rpc("tools/call", { name: "get_document", arguments: { name: "notes" } });
    const storedHtml = (toolJson(stored.json!) as { html: string }).html;
    expect(storedHtml).toContain("<p>raw</p>");
    expect(storedHtml).not.toContain("<main>");
  });

  it("serves a document on the workspace host and not on the API host", async () => {
    await rpc("tools/call", { name: "put_html_document", arguments: { name: "cv", html: HTML_V1 } });
    const page = await env.request("http://demo.localhost:8787/cv");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<script>window.live=1</script>");
    const api = await env.request("http://localhost:8787/cv");
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: { code: "not_found", message: "Not found." } });

    const apiSubdomain = await env.request("http://api.localhost:8787/api/documents", {
      method: "GET",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(apiSubdomain.status).toBe(200);
    expect(apiSubdomain.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("accepts a raw PUT of HTML and keeps the id on replace", async () => {
    const created = await env.request("http://localhost:8787/api/documents/cv", {
      method: "PUT",
      headers: { "content-type": "text/html" },
      body: HTML_V1,
    });
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { id: string; created: boolean; url: string };
    expect(createdBody.created).toBe(true);
    expect(createdBody.url).toBe("http://demo.localhost:8787/cv");

    const denied = await env.request("http://localhost:8787/api/documents/cv", {
      method: "PUT",
      body: HTML_V2,
      auth: false,
    });
    expect(denied.status).toBe(401);

    const replaced = await env.request("http://localhost:8787/api/documents/cv", {
      method: "PUT",
      body: HTML_V2,
    });
    const replacedBody = (await replaced.json()) as { id: string; created: boolean };
    expect(replaced.status).toBe(200);
    expect(replacedBody.created).toBe(false);
    expect(replacedBody.id).toBe(createdBody.id);

    const empty = await env.request("http://localhost:8787/api/documents/cv", {
      method: "PUT",
      body: "   ",
    });
    expect(empty.status).toBe(400);
    await expect(empty.json()).resolves.toMatchObject({ error: { code: "invalid_html" } });
  });

  it("assigns an id to an old object on the next put", async () => {
    env.memory.seedWithoutId(env.organizationId, "legacy", HTML_V1);
    const listed = await env.request("http://localhost:8787/api/documents", { method: "GET" });
    const before = (await listed.json()) as { documents: { id: string | null; name: string }[] };
    expect(before.documents[0]).toMatchObject({ name: "legacy", id: null });
    const replaced = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "legacy", html: HTML_V2 },
    });
    const body = toolJson(replaced.json!) as { id: string };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("renames a document, keeps the id, and 404s the old URL", async () => {
    const created = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "cv", html: HTML_V1 },
    });
    const id = toolJson(created.json!).id;
    const taken = await rpc("tools/call", {
      name: "put_html_document",
      arguments: { name: "resume", html: HTML_V2 },
    });
    expect(toolJson(taken.json!).created).toBe(true);
    const conflict = await rpc("tools/call", {
      name: "rename_document",
      arguments: { name: "cv", new_name: "resume" },
    });
    expect(toolJson(conflict.json!).error).toMatchObject({ code: "name_taken" });
    const missing = await rpc("tools/call", {
      name: "rename_document",
      arguments: { name: "missing", new_name: "other" },
    });
    expect(toolJson(missing.json!).error).toMatchObject({ code: "not_found" });
    await rpc("tools/call", { name: "delete_document", arguments: { name: "resume" } });
    const renamed = await rpc("tools/call", {
      name: "rename_document",
      arguments: { name: "cv", new_name: "resume" },
    });
    expect(toolJson(renamed.json!)).toMatchObject({
      id,
      name: "resume",
      from: "cv",
      url: "http://demo.localhost:8787/resume",
    });
    const oldPage = await env.request("http://demo.localhost:8787/cv");
    expect(oldPage.status).toBe(404);
    const newPage = await env.request("http://demo.localhost:8787/resume");
    expect(newPage.status).toBe(200);
    expect(await newPage.text()).toContain("Version 1");
  });

  it("deletes a document from the bucket over HTTP", async () => {
    const created = await env.request("http://localhost:8787/api/documents/cv", {
      method: "PUT",
      headers: { "content-type": "text/html" },
      body: HTML_V1,
    });
    expect(created.status).toBe(200);
    const removed = await env.request("http://localhost:8787/api/documents/cv", {
      method: "DELETE",
      headers: { Origin: "http://localhost:5173" },
    });
    expect(removed.status).toBe(200);
    expect(removed.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
    await expect(removed.json()).resolves.toEqual({ deleted: "cv" });
    const listed = await env.request("http://localhost:8787/api/documents", { method: "GET" });
    await expect(listed.json()).resolves.toMatchObject({ documents: [] });
    const page = await env.request("http://demo.localhost:8787/cv");
    expect(page.status).toBe(404);
    const again = await env.request("http://localhost:8787/api/documents/cv", { method: "DELETE" });
    expect(again.status).toBe(404);
    await expect(again.json()).resolves.toMatchObject({ error: { code: "not_found" } });
  });

  it("hides the list without a session", async () => {
    const actor = await actorFromRequest(env.auth, new Request("http://localhost:8787/api/documents"));
    expect(isActor(actor)).toBe(false);
    const response = await env.request("http://localhost:8787/api/documents", { auth: false });
    expect(response.status).toBe(401);
  });

  it("allows the configured app origin to read the list", async () => {
    const response = await env.request("http://localhost:8787/api/documents", {
      method: "GET",
      headers: { Origin: "http://localhost:5173" },
      auth: false,
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");

    const preflight = await env.request("http://api.localhost:8787/api/documents", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "DELETE" },
      auth: false,
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});
