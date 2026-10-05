import { MAX_DOCUMENTS, documentUrl, type UrlConfig } from "./config";
import { appError, messages, type Result } from "./errors";
import { prepareHtml } from "./html";
import { isMarkdownUpload, renderMarkdown } from "./markdown";
import { normalizeDocumentName } from "./names";

export type DocumentSummary = {
  id: string | null;
  name: string;
  url: string;
  updated_at: string;
  bytes: number;
};

export type PutResult = DocumentSummary & {
  created: boolean;
};

export type GetResult = DocumentSummary & {
  html: string;
};

export type RenameResult = DocumentSummary & {
  from: string;
};

const OBJECT_HTTP_METADATA = {
  contentType: "text/html; charset=utf-8",
  cacheControl: "no-cache",
};

function storedId(object: R2Object | null | undefined): string | null {
  const id = object?.customMetadata?.id;
  return id && id.length > 0 ? id : null;
}

function nextId(object: R2Object | null | undefined): string {
  return storedId(object) ?? crypto.randomUUID();
}

async function listObjects(bucket: R2Bucket): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({
      cursor,
      limit: 1000,
      include: ["customMetadata"],
    });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
}

function toSummary(object: R2Object, config: UrlConfig): DocumentSummary {
  return {
    id: storedId(object),
    name: object.key,
    url: documentUrl(config, object.key),
    updated_at: object.uploaded.toISOString(),
    bytes: object.size,
  };
}

export async function listDocuments(
  bucket: R2Bucket,
  config: UrlConfig,
): Promise<DocumentSummary[]> {
  const objects = await listObjects(bucket);
  const documents = objects
    .filter((object) => {
      const name = normalizeDocumentName(object.key);
      return name.ok && name.value === object.key;
    })
    .map((object) => toSummary(object, config));

  documents.sort((a, b) => {
    const byDate = b.updated_at.localeCompare(a.updated_at);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });

  return documents;
}

export async function putDocument(
  bucket: R2Bucket,
  config: UrlConfig,
  input: { name: unknown; html: unknown; contentType?: string | null },
): Promise<Result<PutResult>> {
  if (typeof input.html !== "string") {
    return {
      ok: false,
      error: appError("bad_request", "Field html must be a string.", 400),
    };
  }

  const markdown = isMarkdownUpload(input.name, input.contentType);
  const name = normalizeDocumentName(input.name);
  if (!name.ok) return name;

  const html = markdown
    ? renderMarkdown(name.value, input.html)
    : prepareHtml(name.value, input.html);
  if (!html.ok) return html;

  const existing = await bucket.head(name.value);
  if (!existing) {
    const documents = await listDocuments(bucket, config);
    if (documents.length >= MAX_DOCUMENTS) {
      return {
        ok: false,
        error: appError("limit_exceeded", messages.limitDocuments, 413),
      };
    }
  }

  const id = nextId(existing);
  const stored = await bucket.put(name.value, html.value, {
    httpMetadata: OBJECT_HTTP_METADATA,
    customMetadata: { id },
  });
  const uploaded = stored?.uploaded ?? new Date();
  const bytes = stored?.size ?? new TextEncoder().encode(html.value).byteLength;

  return {
    ok: true,
    value: {
      id,
      name: name.value,
      url: documentUrl(config, name.value),
      created: !existing,
      updated_at: uploaded.toISOString(),
      bytes,
    },
  };
}

export async function getDocument(
  bucket: R2Bucket,
  config: UrlConfig,
  nameInput: unknown,
): Promise<Result<GetResult>> {
  const name = normalizeDocumentName(nameInput);
  if (!name.ok) return name;

  const object = await bucket.get(name.value);
  if (!object) {
    return {
      ok: false,
      error: appError("not_found", messages.notFound, 404),
    };
  }

  const html = await object.text();
  return {
    ok: true,
    value: {
      ...toSummary(object, config),
      html,
    },
  };
}

export async function deleteDocument(
  bucket: R2Bucket,
  nameInput: unknown,
): Promise<Result<{ deleted: string }>> {
  const name = normalizeDocumentName(nameInput);
  if (!name.ok) return name;

  const existing = await bucket.head(name.value);
  if (!existing) {
    return {
      ok: false,
      error: appError("not_found", messages.notFound, 404),
    };
  }

  await bucket.delete(name.value);
  return { ok: true, value: { deleted: name.value } };
}

export async function renameDocument(
  bucket: R2Bucket,
  config: UrlConfig,
  input: { name: unknown; new_name: unknown },
): Promise<Result<RenameResult>> {
  const from = normalizeDocumentName(input.name);
  if (!from.ok) return from;
  const to = normalizeDocumentName(input.new_name);
  if (!to.ok) return to;

  const source = await bucket.get(from.value);
  if (!source) {
    return {
      ok: false,
      error: appError("not_found", messages.notFound, 404),
    };
  }

  if (from.value === to.value) {
    const id = nextId(source);
    if (!storedId(source)) {
      const html = await source.text();
      await bucket.put(from.value, html, {
        httpMetadata: OBJECT_HTTP_METADATA,
        customMetadata: { id },
      });
    }
    return {
      ok: true,
      value: {
        ...toSummary(source, config),
        id,
        from: from.value,
      },
    };
  }

  const taken = await bucket.head(to.value);
  if (taken) {
    return {
      ok: false,
      error: appError("name_taken", messages.nameTaken, 409),
    };
  }

  const html = await source.text();
  const id = nextId(source);
  const stored = await bucket.put(to.value, html, {
    httpMetadata: OBJECT_HTTP_METADATA,
    customMetadata: { id },
  });
  await bucket.delete(from.value);

  return {
    ok: true,
    value: {
      id,
      name: to.value,
      url: documentUrl(config, to.value),
      from: from.value,
      updated_at: (stored?.uploaded ?? new Date()).toISOString(),
      bytes: stored?.size ?? source.size,
    },
  };
}
