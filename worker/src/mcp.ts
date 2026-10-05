import { bearerMatches } from "./auth";
import type { UrlConfig } from "./config";
import {
  deleteDocument,
  getDocument,
  listDocuments,
  putDocument,
  renameDocument,
} from "./documents";
import { appError, errorBody, messages, type AppError } from "./errors";

export type McpEnv = UrlConfig & {
  BUCKET: R2Bucket;
  MCP_KEY: string;
};

type JsonRpcId = string | number | null;

type ToolContent = {
  type: "text";
  text: string;
};

const PROTOCOL_VERSIONS = ["2025-03-26", "2024-11-05"];

const tools = [
  {
    name: "list_documents",
    description:
      "List documents in this folder: id, name, canonical URL, updated_at, and bytes. Does not return HTML. Call this before put_document so an existing name is not replaced by accident. Sorted by updated_at descending.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "put_document",
    description:
      "Create or replace a document. The name is the URL path segment. A second call with the same name replaces the body and keeps the URL. A name ending in .md is markdown: it is rendered into the reading template and only the HTML is stored. Any other name stores HTML as sent. The page is live immediately; there is no publish or deploy tool. Returns JSON with the canonical url.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "Document name, 1–64 chars. Lowercase letters, numbers, and hyphens. A single trailing .html or .md is removed. A trailing .md means the html field is markdown and will be rendered.",
        },
        html: {
          type: "string",
          description:
            "HTML to store, or markdown when the name ends with .md. An HTML fragment without <html> is wrapped. Markdown is rendered into the reading template and the source is not stored. Author scripts in HTML are kept.",
        },
      },
      required: ["name", "html"],
      additionalProperties: false,
    },
  },
  {
    name: "get_document",
    description: "Read the original HTML stored for a document, plus its canonical URL.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_document",
    description:
      "Delete a document immediately. The public URL then 404s. The same name can be used again. There is no confirmation step.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
  },
  {
    name: "rename_document",
    description:
      "Change the URL path segment. The document id stays the same. The old URL 404s; there is no redirect. Fails with name_taken if the new name is already used.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Current document name.",
        },
        new_name: {
          type: "string",
          description: "New document name. Same grammar as put_document.",
        },
      },
      required: ["name", "new_name"],
      additionalProperties: false,
    },
  },
] as const;

function jsonResponse(body: unknown, status = 200, extra?: HeadersInit): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

function rpcResponse(request: Request, body: unknown, status = 200): Response {
  const accept = request.headers.get("Accept") ?? "";
  const json = JSON.stringify(body);
  const sseOnly = accept.includes("text/event-stream") && !accept.includes("application/json") && !accept.includes("*/*");
  if (sseOnly) {
    return new Response(`event: message\ndata: ${json}\n\n`, {
      status,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
  }
  return jsonResponse(body, status);
}

function rpcError(request: Request, id: JsonRpcId, code: number, message: string): Response {
  return rpcResponse(request, {
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function toolSuccess(id: JsonRpcId, value: unknown): unknown {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [{ type: "text", text: JSON.stringify(value, null, 2) } satisfies ToolContent],
    },
  };
}

function toolFailure(id: JsonRpcId, error: AppError): unknown {
  return {
    jsonrpc: "2.0",
    id,
    result: {
      content: [
        {
          type: "text",
          text: JSON.stringify(errorBody(error), null, 2),
        } satisfies ToolContent,
      ],
      isError: true,
    },
  };
}

function requireFields(
  args: Record<string, unknown>,
  fields: string[],
): AppError | null {
  const missing = fields.filter((field) => !Object.hasOwn(args, field));
  if (missing.length === 0) return null;
  return appError("bad_request", `Missing required field: ${missing.join(", ")}.`, 400);
}

async function callTool(
  env: McpEnv,
  name: string,
  args: Record<string, unknown>,
): Promise<{ ok: true; value: unknown } | { ok: false; error: AppError }> {
  if (name === "list_documents") {
    const documents = await listDocuments(env.BUCKET, env);
    return {
      ok: true,
      value: { workspace: env.WORKSPACE_SLUG, documents },
    };
  }

  if (name === "put_document") {
    const missing = requireFields(args, ["name", "html"]);
    if (missing) return { ok: false, error: missing };
    const result = await putDocument(env.BUCKET, env, {
      name: args.name,
      html: args.html,
    });
    if (!result.ok) return result;
    console.log(
      JSON.stringify({
        event: "put_document",
        name: result.value.name,
        created: result.value.created,
        bytes: result.value.bytes,
      }),
    );
    return result;
  }

  if (name === "get_document") {
    const missing = requireFields(args, ["name"]);
    if (missing) return { ok: false, error: missing };
    return getDocument(env.BUCKET, env, args.name);
  }

  if (name === "delete_document") {
    const missing = requireFields(args, ["name"]);
    if (missing) return { ok: false, error: missing };
    const result = await deleteDocument(env.BUCKET, args.name);
    if (result.ok) {
      console.log(JSON.stringify({ event: "delete_document", name: result.value.deleted }));
    }
    return result;
  }

  if (name === "rename_document") {
    const missing = requireFields(args, ["name", "new_name"]);
    if (missing) return { ok: false, error: missing };
    const result = await renameDocument(env.BUCKET, env, {
      name: args.name,
      new_name: args.new_name,
    });
    if (result.ok) {
      console.log(
        JSON.stringify({
          event: "rename_document",
          from: result.value.from,
          name: result.value.name,
          id: result.value.id,
        }),
      );
    }
    return result;
  }

  return {
    ok: false,
    error: appError("bad_request", `Unknown tool: ${name}.`, 400),
  };
}

export async function handleMcp(request: Request, env: McpEnv): Promise<Response> {
  if (request.method === "GET" || request.method === "DELETE") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "POST" } });
  }

  const authorized = await bearerMatches(request.headers.get("Authorization"), env.MCP_KEY);
  if (!authorized) {
    return jsonResponse(errorBody(appError("unauthorized", messages.unauthorized, 401)), 401, {
      "WWW-Authenticate": "Bearer",
    });
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 3 * 1024 * 1024) {
    return jsonResponse(errorBody(appError("limit_exceeded", messages.limitBytes, 413)), 413);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return rpcError(request, null, -32700, "Parse error.");
  }

  if (Array.isArray(payload) || !payload || typeof payload !== "object") {
    return rpcError(request, null, -32600, "Invalid request.");
  }

  const message = payload as {
    jsonrpc?: unknown;
    id?: JsonRpcId;
    method?: unknown;
    params?: unknown;
  };

  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return rpcError(request, message.id ?? null, -32600, "Invalid request.");
  }

  if (!Object.hasOwn(message, "id")) {
    return new Response(null, { status: 202 });
  }

  const id = message.id ?? null;
  const params =
    message.params && typeof message.params === "object"
      ? (message.params as Record<string, unknown>)
      : {};

  if (message.method === "initialize") {
    const requested = params.protocolVersion;
    const protocolVersion =
      typeof requested === "string" && PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : PROTOCOL_VERSIONS[0];
    return rpcResponse(request, {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "webdocs", version: "0.1.0" },
      },
    });
  }

  if (message.method === "ping") {
    return rpcResponse(request, { jsonrpc: "2.0", id, result: {} });
  }

  if (message.method === "tools/list") {
    return rpcResponse(request, { jsonrpc: "2.0", id, result: { tools } });
  }

  if (message.method === "tools/call") {
    const toolName = params.name;
    if (typeof toolName !== "string") {
      return rpcResponse(
        request,
        toolFailure(id, appError("bad_request", "Missing required field: name.", 400)),
      );
    }
    const args = params.arguments ?? {};
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      return rpcResponse(
        request,
        toolFailure(id, appError("bad_request", "Tool arguments must be an object.", 400)),
      );
    }
    const result = await callTool(env, toolName, args as Record<string, unknown>);
    if (!result.ok) return rpcResponse(request, toolFailure(id, result.error));
    return rpcResponse(request, toolSuccess(id, result.value));
  }

  return rpcError(request, id, -32601, `Method not found: ${message.method}.`);
}
