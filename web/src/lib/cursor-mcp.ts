const LOCAL_MCP_URL = "http://127.0.0.1:8787/mcp";

export function cursorMcpInstallHref(apiOrigin = import.meta.env.VITE_API_ORIGIN ?? ""): string {
  const origin = apiOrigin.replace(/\/$/, "");
  const config = {
    url: origin ? `${origin}/mcp` : LOCAL_MCP_URL,
    headers: { Authorization: "Bearer <MCP_KEY>" },
  };
  const link = new URL("cursor://anysphere.cursor-deeplink/mcp/install");
  link.searchParams.set("name", "webdocs");
  link.searchParams.set("config", btoa(JSON.stringify(config)));
  return link.toString();
}
