import { Hono } from "hono";
import { publicOrigin } from "./config";
import { listDocuments } from "./documents";
import { handleMcp, type McpEnv } from "./mcp";

const app = new Hono<{ Bindings: Env }>();

app.use("/api/*", async (c, next) => {
  const origin = c.req.header("Origin");
  if (origin && origin === c.env.APP_ORIGIN) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Vary", "Origin");
    c.header("Access-Control-Allow-Methods", "GET, OPTIONS");
    c.header("Access-Control-Allow-Headers", "Content-Type");
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

app.on(["POST", "GET", "DELETE"], "/mcp", (c) => {
  return handleMcp(c.req.raw, c.env satisfies McpEnv);
});

app.all("*", (c) => {
  return c.json({ error: { code: "not_found", message: "Not found." } }, 404);
});

export default app;
