import type { AppDeps } from "./app";
import { findOrganizationBySlug } from "../auth";
import { isBackendPath, workspaceSlug } from "./host";
import { documentNotFound, handlePublic } from "./public";
import type { Hono } from "hono";

export type ServerDeps = AppDeps & {
  app: Hono;
};

export async function handleRequest(request: Request, deps: ServerDeps): Promise<Response | null> {
  const url = new URL(request.url);
  const slug = workspaceSlug(url.host, deps.config.HOST);
  if (slug) {
    const organization = await findOrganizationBySlug(deps.auth, slug);
    if (!organization) return documentNotFound();
    return handlePublic(request, deps.store, organization.id);
  }
  if (isBackendPath(url.pathname)) return deps.app.fetch(request);
  return null;
}

export function notFoundJson(): Response {
  return new Response(JSON.stringify({ error: { code: "not_found", message: "Not found." } }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
