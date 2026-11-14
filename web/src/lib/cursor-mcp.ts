export function cursorMcpInstallHref(apiOrigin = import.meta.env.VITE_API_ORIGIN ?? ""): string {
  const origin = (apiOrigin || window.location.origin).replace(/\/$/, "");
  const config = {
    url: `${origin}/mcp`,
  };
  const link = new URL("cursor://anysphere.cursor-deeplink/mcp/install");
  link.searchParams.set("name", "webdocs");
  link.searchParams.set("config", btoa(JSON.stringify(config)));
  return link.toString();
}
