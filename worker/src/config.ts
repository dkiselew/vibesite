export const MAX_DOCUMENTS = 30;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;

export type UrlConfig = {
  URL_SCHEME: string;
  HOST: string;
};

export type RuntimeConfig = UrlConfig & {
  BETTER_AUTH_URL: string;
};

export function documentUrl(config: UrlConfig, slug: string, name: string): string {
  return `${config.URL_SCHEME}://${slug}.${config.HOST}/${name}`;
}

export function publicOrigin(config: UrlConfig, slug: string): string {
  return `${config.URL_SCHEME}://${slug}.${config.HOST}`;
}

export function mcpResource(baseURL: string): string {
  return `${baseURL.replace(/\/$/, "")}/mcp`;
}
