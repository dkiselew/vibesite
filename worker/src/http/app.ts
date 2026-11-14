import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { Hono } from "hono";
import { actorFromRequest, isActor, type Auth } from "../auth";
import { MAX_HTML_BYTES, publicOrigin, type RuntimeConfig } from "../config";
import { deleteDocument, listDocuments, putDocument } from "../documents/documents";
import { appError, errorBody, messages } from "../errors";
import { handleMcp } from "../mcp";
import type { ObjectStore } from "../store/store";

export type AppDeps = {
  auth: Auth;
  store: ObjectStore;
  config: RuntimeConfig;
};

function jsonError(error: ReturnType<typeof appError>, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(errorBody(error)), { status: error.status, headers });
}

export function createApp(deps: AppDeps): Hono {
  const { auth, store, config } = deps;
  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    if (c.req.method === "OPTIONS") {
      const response = c.body(null, 204);
      allowAppOrigin({ req: c.req, res: response }, config.BETTER_AUTH_URL);
      return response;
    }
    await next();
    // A handler that returns its own Response drops headers set before next().
    allowAppOrigin(c, config.BETTER_AUTH_URL);
  });

  app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
  app.on(["GET", "HEAD"], "/.well-known/oauth-protected-resource", (c) => auth.handler(c.req.raw));
  app.on(["GET", "HEAD"], "/.well-known/oauth-protected-resource/*", (c) => auth.handler(c.req.raw));
  app.get("/.well-known/oauth-authorization-server", (c) => oauthProviderAuthServerMetadata(auth)(c.req.raw));
  app.get("/.well-known/openid-configuration", (c) => oauthProviderOpenIdConfigMetadata(auth)(c.req.raw));

  app.get("/api/documents", async (c) => {
    const actor = await actorFromRequest(auth, c.req.raw);
    if (!isActor(actor)) return actor;
    try {
      const documents = await listDocuments(store, config, actor);
      c.header("Cache-Control", "no-store");
      return c.json({
        workspace: actor.slug,
        origin: publicOrigin(config, actor.slug),
        documents,
      });
    } catch (error) {
      return storageFailure(error);
    }
  });

  app.put("/api/documents/:name", async (c) => {
    const actor = await actorFromRequest(auth, c.req.raw);
    if (!isActor(actor)) return actor;
    const contentLength = Number(c.req.header("Content-Length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_HTML_BYTES) {
      return jsonError(appError("limit_exceeded", messages.limitBytes, 413));
    }
    try {
      const html = await c.req.text();
      const result = await putDocument(store, config, actor, {
        name: c.req.param("name"),
        html,
        contentType: c.req.header("Content-Type") ?? null,
      });
      if (!result.ok) return jsonError(result.error);
      c.header("Cache-Control", "no-store");
      return c.json(result.value);
    } catch (error) {
      return storageFailure(error);
    }
  });

  app.delete("/api/documents/:name", async (c) => {
    const actor = await actorFromRequest(auth, c.req.raw);
    if (!isActor(actor)) return actor;
    try {
      const result = await deleteDocument(store, actor, c.req.param("name"));
      if (!result.ok) return jsonError(result.error);
      c.header("Cache-Control", "no-store");
      return c.json(result.value);
    } catch (error) {
      return storageFailure(error);
    }
  });

  app.on(["GET", "DELETE"], "/mcp", () => {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  });

  app.post("/mcp", async (c) => {
    const actor = await actorFromRequest(auth, c.req.raw);
    if (!isActor(actor)) return actor;
    return handleMcp(c.req.raw, { ...config, ...actor, store });
  });

  return app;
}

function allowAppOrigin(c: { req: { header(name: string): string | undefined }; res: Response }, appOrigin: string) {
  const origin = c.req.header("Origin");
  if (!origin || origin !== appOrigin) return;
  c.res.headers.set("Access-Control-Allow-Origin", origin);
  c.res.headers.set("Vary", "Origin");
  c.res.headers.set("Access-Control-Allow-Credentials", "true");
  c.res.headers.set("Access-Control-Allow-Methods", "GET, PUT, DELETE, OPTIONS");
  c.res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function storageFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Object storage failed.";
  const status = message === "Object storage is not configured." ? 503 : 500;
  return jsonError(appError("bad_request", message, status));
}
