export function workspaceSlug(requestHost: string, appHost: string): string | null {
  const host = requestHost.trim().toLowerCase();
  const app = appHost.trim().toLowerCase();
  if (!host || !app || host === app) return null;
  const suffix = `.${app}`;
  if (!host.endsWith(suffix)) return null;
  const slug = host.slice(0, -suffix.length);
  if (!slug || slug.includes(".")) return null;
  return slug;
}

export function isBackendPath(pathname: string): boolean {
  return (
    pathname === "/mcp" ||
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/oauth2/") ||
    pathname.startsWith("/.well-known/")
  );
}
