import type { UrlConfig } from "./config";
import {
  deleteDocument,
  getDocument,
  listDocuments,
  putDocument,
  renameDocument,
  type DocumentScope,
} from "./documents/documents";
import { appError, errorBody, messages, type AppError } from "./errors";
import type { ObjectStore } from "./store/store";

export type McpEnv = UrlConfig &
  DocumentScope & {
    store: ObjectStore;
  };

type JsonRpcId = string | number | null;

type ToolContent = {
  type: "text";
  text: string;
};

const PROTOCOL_VERSIONS = ["2025-03-26", "2024-11-05"];
const MAX_RPC_BYTES = 6 * 1024 * 1024;

const INSTRUCTIONS = `Documents are live at the url returned by the write tools. There is no draft, preview, publish, or deploy step.

A new document is markdown. Call list_documents, pick a name that is not already in the list, and call put_markdown_document. Do not add a document shell, Tailwind, or font tags. The server renders that markdown into the reading template and stores only the HTML. The markdown is not kept.

Edit an existing page with get_document, change only the part the user asked for, then put_html_document with the full HTML. Do not call get_document again for a body you just wrote. Call put_markdown_document on an existing name only when the user asked to rewrite the page from scratch. That renders the template again and replaces any HTML edits.

If the chosen name is already in the list, replace it only when the user asked to update that document. If they asked for a new document, pick another valid name or ask. Do not overwrite silently.

Rename with rename_document, not a write plus delete_document. The id stays the same. Call delete_document only when the user asked to delete.

Read url from the write result and show it as a clickable markdown link. Do not invent a different address. Do not paste the page into the chat and do not write the HTML into the user's repository.

Images and other assets must be https: URLs or data: URIs. No local paths and no relative files. Author script tags in HTML are stored and served as written.

A single trailing .html or .md is stripped from the name and does not choose the format. The tool does.`;

const nameProperty = {
  type: "string",
  description:
    "Document name, 1–64 chars. Lowercase letters, numbers, and hyphens. A single trailing .html or .md is removed and does not choose the format.",
};

const tools = [
  {
    name: "list_documents",
    description:
      "List documents in this folder: id, name, canonical URL, updated_at, and bytes. Does not return HTML. Call this before creating a document so an existing name is not replaced by accident. Sorted by updated_at descending.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "put_markdown_document",
    description:
      "Create a document or rewrite it from scratch. The server renders the markdown into the reading template and stores only the HTML. The markdown source is not kept. A second call with the same name renders the template again and erases manual HTML edits. The page is live immediately. There is no publish or deploy tool. Returns JSON with the canonical url and does not echo the body.",
    inputSchema: {
      type: "object",
      properties: {
        name: nameProperty,
        markdown: {
          type: "string",
          description: "Markdown source. Do not include a document shell, Tailwind, or font tags.",
        },
      },
      required: ["name", "markdown"],
      additionalProperties: false,
    },
  },
  {
    name: "put_html_document",
    description:
      "Store HTML as sent. A fragment without <html> is wrapped. The markdown template does not run, even when the name ends in .md. A second call with the same name replaces the body and keeps the URL. Use this to edit an existing page: send the full page. Returns JSON with the canonical url and does not echo the body.",
    inputSchema: {
      type: "object",
      properties: {
        name: nameProperty,
        html: {
          type: "string",
          description:
            "HTML to store. An HTML fragment without <html> is wrapped. Author scripts are kept.",
        },
      },
      required: ["name", "html"],
      additionalProperties: false,
    },
  },
  {
    name: "get_document",
    description:
      "Read the original HTML stored for a document, plus its canonical URL. This is not the public copy: no banner and no script stripping. Call this before editing an existing page. Do not call it again for a body you just wrote.",
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
          description: "New document name. Same grammar as the write tools.",
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
  const scope = { organizationId: env.organizationId, slug: env.slug };

  if (name === "list_documents") {
    const documents = await listDocuments(env.store, env, scope);
    return {
      ok: true,
      value: { workspace: env.slug, documents },
    };
  }

  if (name === "put_markdown_document" || name === "put_html_document") {
    const format = name === "put_markdown_document" ? "markdown" : "html";
    const bodyField = format === "markdown" ? "markdown" : "html";
    const missing = requireFields(args, ["name", bodyField]);
    if (missing) return { ok: false, error: missing };
    const result = await putDocument(env.store, env, scope, {
      name: args.name,
      html: args[bodyField],
      format,
    });
    if (!result.ok) return result;
    console.log(
      JSON.stringify({
        event: name,
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
    return getDocument(env.store, env, scope, args.name);
  }

  if (name === "delete_document") {
    const missing = requireFields(args, ["name"]);
    if (missing) return { ok: false, error: missing };
    const result = await deleteDocument(env.store, scope, args.name);
    if (result.ok) {
      console.log(JSON.stringify({ event: "delete_document", name: result.value.deleted }));
    }
    return result;
  }

  if (name === "rename_document") {
    const missing = requireFields(args, ["name", "new_name"]);
    if (missing) return { ok: false, error: missing };
    const result = await renameDocument(env.store, env, scope, {
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

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_RPC_BYTES) {
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
        instructions: INSTRUCTIONS,
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
