import { createAuth } from "./auth";
import { createApp } from "./http/app";
import type { RuntimeConfig } from "./config";
import { handleRequest } from "./http/serve";
import { createS3Store, readS3Config } from "./store/s3-store";
import { unavailableStore } from "./store/store";

type WorkerBindings = {
  DB: D1Database;
  ASSETS: Fetcher;
  HOST: string;
  URL_SCHEME: string;
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY_ID?: string;
  S3_SECRET_ACCESS_KEY?: string;
  S3_REGION?: string;
};

type Started = {
  handle: (request: Request) => Promise<Response | null>;
};

let started: Promise<Started> | null = null;

function boot(env: WorkerBindings): Promise<Started> {
  started ??= (async () => {
    const config: RuntimeConfig = {
      HOST: env.HOST,
      URL_SCHEME: env.URL_SCHEME,
      BETTER_AUTH_URL: env.BETTER_AUTH_URL.replace(/\/$/, ""),
    };
    const auth = await createAuth({
      database: env.DB,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: config.BETTER_AUTH_URL,
    });
    const s3 = readS3Config(env);
    const store = s3 ? createS3Store(s3) : unavailableStore();
    const app = createApp({ auth, store, config });
    return {
      handle: (request) => handleRequest(request, { auth, store, config, app }),
    };
  })();
  return started;
}

export default {
  async fetch(request: Request, env: WorkerBindings): Promise<Response> {
    const runtime = await boot(env);
    const handled = await runtime.handle(request);
    if (handled) return handled;
    return env.ASSETS.fetch(request);
  },
};
