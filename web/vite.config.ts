import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import http from "node:http";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss(), documentHosts()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    allowedHosts: [".localhost", "localhost"],
    proxy: {
      "/api": "http://127.0.0.1:8788",
      "/mcp": "http://127.0.0.1:8788",
      "/oauth2": "http://127.0.0.1:8788",
      "/.well-known": "http://127.0.0.1:8788",
    },
  },
});

function documentHosts() {
  return {
    name: "webdocs-document-hosts",
    configureServer(server: { middlewares: { use: (fn: http.RequestListener) => void } }) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host ?? "";
        if (!/^[a-z0-9-]+\.localhost(?::\d+)?$/i.test(host)) {
          next();
          return;
        }
        const proxy = http.request(
          {
            hostname: "127.0.0.1",
            port: 8788,
            path: req.url,
            method: req.method,
            headers: req.headers,
          },
          (proxied) => {
            res.writeHead(proxied.statusCode ?? 502, proxied.headers);
            proxied.pipe(res);
          },
        );
        proxy.on("error", () => {
          res.statusCode = 502;
          res.end("Document server is not running.");
        });
        req.pipe(proxy);
      });
    },
  };
}
