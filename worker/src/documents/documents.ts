import { MAX_DOCUMENTS, documentUrl, type UrlConfig } from "../config";
import { appError, messages, type Result } from "../errors";
import { prepareHtml } from "./html";
import { isMarkdownUpload, renderMarkdown } from "./markdown";
import { normalizeDocumentName } from "./names";
import type { ObjectStore, StoredHead } from "../store/store";

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

export type DocumentScope = {
  organizationId: string;
  slug: string;
};

function nextId(current: string | null | undefined): string {
  return current && current.length > 0 ? current : crypto.randomUUID();
}

function toSummary(head: StoredHead, config: UrlConfig, slug: string): DocumentSummary {
  return {
    id: head.id,
    name: head.name,
    url: documentUrl(config, slug, head.name),
    updated_at: head.updatedAt.toISOString(),
    bytes: head.bytes,
  };
}

async function listed(store: ObjectStore, scope: DocumentScope, config: UrlConfig) {
  const objects = await store.list(scope.organizationId);
  const documents = objects
    .filter((object) => {
      const name = normalizeDocumentName(object.name);
      return name.ok && name.value === object.name;
    })
    .map((object) => toSummary(object, config, scope.slug));
  documents.sort((a, b) => {
    const byDate = b.updated_at.localeCompare(a.updated_at);
    if (byDate !== 0) return byDate;
    return a.name.localeCompare(b.name);
  });
  return documents;
}

export async function listDocuments(
  store: ObjectStore,
  config: UrlConfig,
  scope: DocumentScope,
): Promise<DocumentSummary[]> {
  return listed(store, scope, config);
}

export async function putDocument(
  store: ObjectStore,
  config: UrlConfig,
  scope: DocumentScope,
  input: {
    name: unknown;
    html: unknown;
    contentType?: string | null;
    format?: "markdown" | "html";
  },
): Promise<Result<PutResult>> {
  if (typeof input.html !== "string") {
    return { ok: false, error: appError("bad_request", "Field html must be a string.", 400) };
  }
  const markdown =
    input.format === "markdown"
      ? true
      : input.format === "html"
        ? false
        : isMarkdownUpload(input.name, input.contentType);
  const name = normalizeDocumentName(input.name);
  if (!name.ok) return name;
  const html = markdown ? renderMarkdown(name.value, input.html) : prepareHtml(name.value, input.html);
  if (!html.ok) return html;

  const existing = await store.head(scope.organizationId, name.value);
  if (!existing) {
    const documents = await listed(store, scope, config);
    if (documents.length >= MAX_DOCUMENTS) {
      return { ok: false, error: appError("limit_exceeded", messages.limitDocuments, 413) };
    }
  }

  const id = nextId(existing?.id);
  const stored = await store.put(scope.organizationId, name.value, html.value, { id });
  return {
    ok: true,
    value: {
      id,
      name: name.value,
      url: documentUrl(config, scope.slug, name.value),
      created: !existing,
      updated_at: stored.updatedAt.toISOString(),
      bytes: stored.bytes,
    },
  };
}

export async function getDocument(
  store: ObjectStore,
  config: UrlConfig,
  scope: DocumentScope,
  nameInput: unknown,
): Promise<Result<GetResult>> {
  const name = normalizeDocumentName(nameInput);
  if (!name.ok) return name;
  const object = await store.get(scope.organizationId, name.value);
  if (!object) return { ok: false, error: appError("not_found", messages.notFound, 404) };
  return { ok: true, value: { ...toSummary(object, config, scope.slug), html: object.body } };
}

export async function deleteDocument(
  store: ObjectStore,
  scope: DocumentScope,
  nameInput: unknown,
): Promise<Result<{ deleted: string }>> {
  const name = normalizeDocumentName(nameInput);
  if (!name.ok) return name;
  const existing = await store.head(scope.organizationId, name.value);
  if (!existing) return { ok: false, error: appError("not_found", messages.notFound, 404) };
  await store.delete(scope.organizationId, name.value);
  return { ok: true, value: { deleted: name.value } };
}

export async function renameDocument(
  store: ObjectStore,
  config: UrlConfig,
  scope: DocumentScope,
  input: { name: unknown; new_name: unknown },
): Promise<Result<RenameResult>> {
  const from = normalizeDocumentName(input.name);
  if (!from.ok) return from;
  const to = normalizeDocumentName(input.new_name);
  if (!to.ok) return to;

  const source = await store.get(scope.organizationId, from.value);
  if (!source) return { ok: false, error: appError("not_found", messages.notFound, 404) };

  if (from.value === to.value) {
    const id = nextId(source.id);
    if (!source.id) {
      await store.put(scope.organizationId, from.value, source.body, { id });
    }
    return {
      ok: true,
      value: { ...toSummary({ ...source, id }, config, scope.slug), from: from.value },
    };
  }

  const taken = await store.head(scope.organizationId, to.value);
  if (taken) return { ok: false, error: appError("name_taken", messages.nameTaken, 409) };

  const id = nextId(source.id);
  if (source.id) {
    const copied = await store.copy(scope.organizationId, from.value, to.value);
    await store.delete(scope.organizationId, from.value);
    return {
      ok: true,
      value: {
        ...toSummary(copied, config, scope.slug),
        id: copied.id ?? id,
        from: from.value,
      },
    };
  }

  const stored = await store.put(scope.organizationId, to.value, source.body, { id });
  await store.delete(scope.organizationId, from.value);
  return {
    ok: true,
    value: {
      id,
      name: to.value,
      url: documentUrl(config, scope.slug, to.value),
      from: from.value,
      updated_at: stored.updatedAt.toISOString(),
      bytes: stored.bytes,
    },
  };
}
