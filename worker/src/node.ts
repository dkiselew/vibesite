import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { createAuth } from "./auth";
import { createApp } from "./http/app";
import type { RuntimeConfig } from "./config";
import { handleRequest, notFoundJson } from "./http/serve";
import { createS3Store, readS3Config } from "./store/s3-store";
import { unavailableStore } from "./store/store";

loadEnvFile(resolve(".env"));

const dataFile = process.env.DATA_FILE?.trim() || resolve("data/webdocs.sqlite");
const port = Number(process.env.PORT ?? "8788");
const config = readNodeConfig();
const secret = process.env.BETTER_AUTH_SECRET?.trim() || devSecret();

mkdirSync(dirname(dataFile), { recursive: true });
const sqlite = new Database(dataFile);
const auth = await createAuth({ database: sqlite, secret, baseURL: config.BETTER_AUTH_URL });

const s3 = readS3Config(process.env as Record<string, string | undefined>);
const store = s3 ? createS3Store(s3) : unavailableStore();
const app = createApp({ auth, store, config });
const webRoot = resolve(process.env.WEB_DIST?.trim() || "../web/dist");

serve(
  {
    fetch: async (request) => {
      const handled = await handleRequest(request, { auth, store, config, app });
      if (handled) return handled;
      if (request.method === "GET" || request.method === "HEAD") {
        const url = new URL(request.url);
        const file = readStatic(webRoot, url.pathname) ?? readStatic(webRoot, "/index.html");
        if (file) {
          if (request.method === "HEAD") return new Response(null, { headers: file.headers });
          return file;
        }
      }
      return notFoundJson();
    },
    port,
    hostname: "0.0.0.0",
  },
  (info) => {
    console.log(`webdocs listening on http://127.0.0.1:${info.port}`);
    console.log(`sqlite ${dataFile}`);
    if (!s3) console.log("S3 is not configured. Document routes will fail until it is.");
  },
);

function readNodeConfig(): RuntimeConfig {
  const url = new URL(process.env.BETTER_AUTH_URL?.trim() || "http://localhost:5173");
  return {
    URL_SCHEME: process.env.URL_SCHEME?.trim() || url.protocol.replace(":", ""),
    HOST: process.env.HOST?.trim() || url.host,
    BETTER_AUTH_URL: url.origin,
  };
}

function devSecret(): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET is required.");
  }
  console.log("BETTER_AUTH_SECRET is unset. Using a local-only default.");
  return "dev-only-change-me-please-32chars";
}

function loadEnvFile(file: string): void {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function readStatic(root: string, pathname: string): Response | null {
  if (!existsSync(root)) return null;
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const file = normalize(join(root, decoded));
  if (!file.startsWith(root)) return null;
  if (!existsSync(file) || !statSync(file).isFile()) return null;
  const stream = createReadStream(file);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    headers: { "Content-Type": mime(extname(file)) },
  });
}

function mime(extension: string): string {
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
