import type { ObjectStore } from "../store/store";

const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Not found</title>
</head>
<body>
<p>This document does not exist.</p>
</body>
</html>
`;

export function documentNotFound(): Response {
  return new Response(NOT_FOUND_HTML, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

export async function handlePublic(
  request: Request,
  store: ObjectStore,
  organizationId: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const url = new URL(request.url);
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    const target = new URL(request.url);
    target.pathname = url.pathname.slice(0, -1);
    return Response.redirect(target.toString(), 301);
  }
  if (url.pathname === "/") return documentNotFound();

  let name: string;
  try {
    name = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return documentNotFound();
  }
  if (!name || name.includes("/")) return documentNotFound();

  const object = await store.get(organizationId, name);
  if (!object) return documentNotFound();

  const headers = new Headers();
  headers.set("Content-Type", object.contentType || "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-cache");
  if (request.method === "HEAD") return new Response(null, { status: 200, headers });
  return new Response(object.body, { status: 200, headers });
}
