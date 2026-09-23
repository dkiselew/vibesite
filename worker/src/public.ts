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

function notFound(): Response {
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
  env: { BUCKET: R2Bucket },
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

  if (url.pathname === "/") return notFound();

  let name: string;
  try {
    name = decodeURIComponent(url.pathname.slice(1));
  } catch {
    return notFound();
  }
  if (!name || name.includes("/")) return notFound();

  const object = await env.BUCKET.get(name);
  if (!object) return notFound();

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  if (!headers.has("content-type")) {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }
  headers.set("Cache-Control", "no-cache");

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(object.body, { status: 200, headers });
}

export default {
  fetch(request: Request, env: { BUCKET: R2Bucket }): Promise<Response> {
    return handlePublic(request, env);
  },
};
