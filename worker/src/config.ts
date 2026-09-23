export const MAX_DOCUMENTS = 30;
export const MAX_HTML_BYTES = 2 * 1024 * 1024;

export type UrlConfig = {
  URL_SCHEME: string;
  HOST: string;
  WORKSPACE_SLUG: string;
};

export function documentUrl(config: UrlConfig, name: string): string {
  return `${config.URL_SCHEME}://${config.WORKSPACE_SLUG}.${config.HOST}/${name}`;
}

export function publicOrigin(config: UrlConfig): string {
  return `${config.URL_SCHEME}://${config.WORKSPACE_SLUG}.${config.HOST}`;
}
