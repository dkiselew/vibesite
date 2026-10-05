import { describe, expect, it } from "vitest";
import dev from "../src/dev";
import app from "../src/index";
import { handlePublic } from "../src/public";
import { MAX_DOCUMENTS } from "../src/config";
import { createMemoryBucket } from "./bucket";

const HTML_V1 = `<!DOCTYPE html><html><body><h1>Version 1</h1><script>window.live=1</script></body></html>`;
const HTML_V2 = `<!DOCTYPE html><html><body><h1>Version 2</h1><script>window.live=2</script></body></html>`;

function testEnv(bucket: R2Bucket): Env {
  return {
    BUCKET: bucket,
    MCP_KEY: "secret",
    WORKSPACE_SLUG: "demo",
    HOST: "localhost:8787",
    URL_SCHEME: "http",
    APP_ORIGIN: "http://localhost:5173",
  };
}

async function rpc(
  env: ReturnType<typeof testEnv>,
  method: string,
  params?: unknown,
  options?: { auth?: string | null; id?: number | null; omitId?: boolean },
) {
  const headers = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  });
  if (options?.auth !== null) {
    headers.set("Authorization", options?.auth ?? "Bearer secret");
  }
  const body: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (!options?.omitId) body.id = options?.id === undefined ? 1 : options.id;
  if (params !== undefined) body.params = params;

  const response = await app.request(
    "http://localhost/mcp",
    { method: "POST", headers, body: JSON.stringify(body) },
    env,
  );
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
    const bucket = createMemoryBucket();
    const env = testEnv(bucket);

    const empty = await app.request("http://localhost/api/documents", { method: "GET" }, env);
    expect(empty.status).toBe(200);
    await expect(empty.json()).resolves.toEqual({
      workspace: "demo",
      origin: "http://demo.localhost:8787",
      documents: [],
    });

    const created = await rpc(env, "tools/call", {
      name: "put_document",
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

    const listed = await rpc(env, "tools/call", {
      name: "list_documents",
      arguments: {},
    });
    const listBody = toolJson(listed.json!) as {
      workspace: string;
      documents: { id: string; name: string; url: string }[];
    };
    expect(listBody.workspace).toBe("demo");
    expect(listBody.documents.map((doc) => doc.name)).toEqual(["cv"]);
    expect(listBody.documents[0].url).toBe("http://demo.localhost:8787/cv");
    expect(listBody.documents[0].id).toBe(createdBody.id);

    const replaced = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "cv", html: HTML_V2 },
    });
    expect(toolJson(replaced.json!).created).toBe(false);
    expect(toolJson(replaced.json!).url).toBe("http://demo.localhost:8787/cv");
    expect(toolJson(replaced.json!).id).toBe(createdBody.id);

    const fetched = await rpc(env, "tools/call", {
      name: "get_document",
      arguments: { name: "cv" },
    });
    const fetchedBody = toolJson(fetched.json!) as { html: string };
    expect(fetchedBody.html).toContain("Version 2");
    expect(fetchedBody.html).toContain("<script>window.live=2</script>");

    const page = await handlePublic(new Request("http://demo.localhost:8787/cv"), env);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
    expect(await page.text()).toContain("<script>window.live=2</script>");

    const root = await handlePublic(new Request("http://demo.localhost:8787/"), env);
    expect(root.status).toBe(404);

    const removed = await rpc(env, "tools/call", {
      name: "delete_document",
      arguments: { name: "cv" },
    });
    expect(toolJson(removed.json!)).toEqual({ deleted: "cv" });

    const after = await rpc(env, "tools/call", {
      name: "list_documents",
      arguments: {},
    });
    expect(toolJson(after.json!)).toEqual({ workspace: "demo", documents: [] });

    const missing = await rpc(env, "tools/call", {
      name: "get_document",
      arguments: { name: "cv" },
    });
    expect(toolJson(missing.json!).error).toMatchObject({ code: "not_found" });
    expect((missing.json!.result as { isError: boolean }).isError).toBe(true);

    const gone = await handlePublic(new Request("http://demo.localhost:8787/cv"), env);
    expect(gone.status).toBe(404);

    const again = await rpc(env, "tools/call", {
      name: "delete_document",
      arguments: { name: "cv" },
    });
    expect(toolJson(again.json!).error).toMatchObject({ code: "not_found" });
  });

  it("rejects a missing or wrong bearer key and does not write", async () => {
    const bucket = createMemoryBucket();
    const env = testEnv(bucket);
    const denied = await rpc(
      env,
      "tools/call",
      { name: "put_document", arguments: { name: "cv", html: HTML_V1 } },
      { auth: "Bearer wrong" },
    );
    expect(denied.status).toBe(401);
    expect(denied.json).toEqual({
      error: { code: "unauthorized", message: "Invalid or missing API key." },
    });
    const page = await handlePublic(new Request("http://demo.localhost:8787/cv"), env);
    expect(page.status).toBe(404);
  });

  it("returns contract errors for empty html and a bad name", async () => {
    const env = testEnv(createMemoryBucket());
    const empty = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "cv", html: "  " },
    });
    expect(toolJson(empty.json!).error).toMatchObject({ code: "invalid_html" });

    const bad = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "a--b", html: "<p>x</p>" },
    });
    expect(toolJson(bad.json!).error).toMatchObject({ code: "invalid_name" });

    const missing = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "cv" },
    });
    expect(toolJson(missing.json!).error).toMatchObject({ code: "bad_request" });
  });

  it("stops at 30 documents and still replaces an existing one", async () => {
    const bucket = createMemoryBucket();
    const env = testEnv(bucket);
    for (let i = 0; i < MAX_DOCUMENTS; i++) {
      const response = await rpc(env, "tools/call", {
        name: "put_document",
        arguments: { name: `doc-${i}`, html: `<p>${i}</p>` },
      });
      expect(toolJson(response.json!).created).toBe(true);
    }

    const overflow = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "extra", html: "<p>no</p>" },
    });
    expect(toolJson(overflow.json!).error).toMatchObject({ code: "limit_exceeded" });

    const replaced = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "doc-0", html: "<p>replaced</p>" },
    });
    expect(toolJson(replaced.json!).created).toBe(false);
  });

  it("sorts list_documents by updated_at descending", async () => {
    const bucket = createMemoryBucket();
    const env = testEnv(bucket);
    await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "older", html: "<p>old</p>" },
    });
    await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "newer", html: "<p>new</p>" },
    });
    bucket.setUploaded("older", new Date("2026-01-01T00:00:00.000Z"));
    bucket.setUploaded("newer", new Date("2026-06-01T00:00:00.000Z"));

    const listed = await app.request("http://localhost/api/documents", { method: "GET" }, env);
    const body = (await listed.json()) as { documents: { name: string }[] };
    expect(body.documents.map((doc) => doc.name)).toEqual(["newer", "older"]);
  });

  it("answers initialize and does not open an SSE session", async () => {
    const env = testEnv(createMemoryBucket());
    const init = await rpc(env, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });
    expect(init.status).toBe(200);
    expect(init.json).toMatchObject({
      result: {
        protocolVersion: "2025-03-26",
        serverInfo: { name: "webdocs" },
      },
    });

    const stream = await app.request("http://localhost/mcp", { method: "GET" }, env);
    expect(stream.status).toBe(405);

    const note = await rpc(env, "notifications/initialized", {}, { omitId: true });
    expect(note.status).toBe(202);
    expect(note.json).toBeNull();
  });

  it("serves a document on the workspace host and not on the API host", async () => {
    const env = testEnv(createMemoryBucket());
    await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "cv", html: HTML_V1 },
    });
    const ctx = {} as ExecutionContext;

    const page = await dev.fetch(new Request("http://demo.localhost:8787/cv"), env, ctx);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("<script>window.live=1</script>");

    const api = await dev.fetch(new Request("http://localhost:8787/cv"), env, ctx);
    expect(api.status).toBe(404);
    expect(await api.json()).toEqual({ error: { code: "not_found", message: "Not found." } });
  });

  it("accepts a raw PUT of HTML and keeps the id on replace", async () => {
    const env = testEnv(createMemoryBucket());
    const created = await app.request(
      "http://localhost/api/documents/cv",
      {
        method: "PUT",
        headers: { Authorization: "Bearer secret", "content-type": "text/html" },
        body: HTML_V1,
      },
      env,
    );
    expect(created.status).toBe(200);
    const createdBody = (await created.json()) as { id: string; created: boolean; url: string };
    expect(createdBody.created).toBe(true);
    expect(createdBody.url).toBe("http://demo.localhost:8787/cv");

    const denied = await app.request(
      "http://localhost/api/documents/cv",
      { method: "PUT", body: HTML_V2 },
      env,
    );
    expect(denied.status).toBe(401);

    const replaced = await app.request(
      "http://localhost/api/documents/cv",
      {
        method: "PUT",
        headers: { Authorization: "Bearer secret" },
        body: HTML_V2,
      },
      env,
    );
    const replacedBody = (await replaced.json()) as { id: string; created: boolean };
    expect(replaced.status).toBe(200);
    expect(replacedBody.created).toBe(false);
    expect(replacedBody.id).toBe(createdBody.id);

    const empty = await app.request(
      "http://localhost/api/documents/cv",
      {
        method: "PUT",
        headers: { Authorization: "Bearer secret" },
        body: "   ",
      },
      env,
    );
    expect(empty.status).toBe(400);
    await expect(empty.json()).resolves.toMatchObject({ error: { code: "invalid_html" } });
  });

  it("assigns an id to an old object on the next put", async () => {
    const bucket = createMemoryBucket();
    bucket.seedWithoutId("legacy", HTML_V1);
    const env = testEnv(bucket);

    const listed = await app.request("http://localhost/api/documents", { method: "GET" }, env);
    const before = (await listed.json()) as { documents: { id: string | null; name: string }[] };
    expect(before.documents[0]).toMatchObject({ name: "legacy", id: null });

    const replaced = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "legacy", html: HTML_V2 },
    });
    const body = toolJson(replaced.json!) as { id: string };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("renames a document, keeps the id, and 404s the old URL", async () => {
    const env = testEnv(createMemoryBucket());
    const created = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "cv", html: HTML_V1 },
    });
    const id = toolJson(created.json!).id;

    const taken = await rpc(env, "tools/call", {
      name: "put_document",
      arguments: { name: "resume", html: HTML_V2 },
    });
    expect(toolJson(taken.json!).created).toBe(true);

    const conflict = await rpc(env, "tools/call", {
      name: "rename_document",
      arguments: { name: "cv", new_name: "resume" },
    });
    expect(toolJson(conflict.json!).error).toMatchObject({ code: "name_taken" });

    const missing = await rpc(env, "tools/call", {
      name: "rename_document",
      arguments: { name: "missing", new_name: "other" },
    });
    expect(toolJson(missing.json!).error).toMatchObject({ code: "not_found" });

    await rpc(env, "tools/call", {
      name: "delete_document",
      arguments: { name: "resume" },
    });

    const renamed = await rpc(env, "tools/call", {
      name: "rename_document",
      arguments: { name: "cv", new_name: "resume" },
    });
    expect(toolJson(renamed.json!)).toMatchObject({
      id,
      name: "resume",
      from: "cv",
      url: "http://demo.localhost:8787/resume",
    });

    const oldPage = await handlePublic(new Request("http://demo.localhost:8787/cv"), env);
    expect(oldPage.status).toBe(404);
    const newPage = await handlePublic(new Request("http://demo.localhost:8787/resume"), env);
    expect(newPage.status).toBe(200);
    expect(await newPage.text()).toContain("Version 1");
  });

  it("allows the configured app origin to read the list", async () => {
    const env = testEnv(createMemoryBucket());
    const response = await app.request(
      "http://localhost/api/documents",
      { method: "GET", headers: { Origin: "http://localhost:5173" } },
      env,
    );
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});
