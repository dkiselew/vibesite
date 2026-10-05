import { Hono } from "hono";
import { bearerMatches } from "./auth";
import { MAX_HTML_BYTES, publicOrigin } from "./config";
import { deleteDocument, listDocuments, putDocument } from "./documents";
import { appError, errorBody, messages } from "./errors";
import { handleMcp, type McpEnv } from "./mcp";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && origin === c.env.APP_ORIGIN) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

app.get("/api/documents", async (c) => {
  const documents = await listDocuments(c.env.BUCKET, c.env);
  c.header("Cache-Control", "no-store");
  return c.json({
    workspace: c.env.WORKSPACE_SLUG,
    origin: publicOrigin(c.env),
    documents,
  });
});

app.put("/api/documents/:name", async (c) => {
  const authorized = await bearerMatches(c.req.header("Authorization") ?? null, c.env.MCP_KEY);
  if (!authorized) {
    return c.json(errorBody(appError("unauthorized", messages.unauthorized, 401)), 401);
  }

  const contentLength = Number(c.req.header("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
    return c.json(errorBody(appError("limit_exceeded", messages.limitBytes, 413)), 413);
  }

  const html = await c.req.text();
  const result = await putDocument(c.env.BUCKET, c.env, {
    name: c.req.param("name"),
    html,
    contentType: c.req.header("Content-Type") ?? null,
  });
  if (!result.ok) {
    return new Response(JSON.stringify(errorBody(result.error)), {
      status: result.error.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
  c.header("Cache-Control", "no-store");
  return c.json(result.value);
});

app.delete("/api/documents/:name", async (c) => {
  const result = await deleteDocument(c.env.BUCKET, c.req.param("name"));
  if (!result.ok) {
    return new Response(JSON.stringify(errorBody(result.error)), {
      status: result.error.status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    });
  }
  c.header("Cache-Control", "no-store");
  return c.json(result.value);
});

app.on(["POST", "GET", "DELETE"], "/mcp", (c) => {
  return handleMcp(c.req.raw, c.env satisfies McpEnv);
});

app.all("*", (c) => {
  return c.json({ error: { code: "not_found", message: "Not found." } }, 404);
});

export default app;
