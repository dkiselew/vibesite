import { objectKey, type ObjectStore, type StoredHead, type StoredObject } from "../src/store/store";

type Recorded = StoredObject;

export function createMemoryStore(): {
  store: ObjectStore;
  setUploaded: (organizationId: string, name: string, updatedAt: Date) => void;
  seedWithoutId: (organizationId: string, name: string, body: string) => void;
} {
  const objects = new Map<string, Recorded>();

  function headOf(record: Recorded): StoredHead {
    return {
      name: record.name,
      id: record.id,
      updatedAt: record.updatedAt,
      bytes: record.bytes,
      contentType: record.contentType,
    };
  }

  const store: ObjectStore = {
    async get(organizationId, name) {
      return objects.get(objectKey(organizationId, name)) ?? null;
    },
    async head(organizationId, name) {
      const record = objects.get(objectKey(organizationId, name));
      return record ? headOf(record) : null;
    },
    async put(organizationId, name, body, meta) {
      const bytes = new TextEncoder().encode(body).byteLength;
      const updatedAt = new Date();
      objects.set(objectKey(organizationId, name), {
        name,
        id: meta.id,
        updatedAt,
        bytes,
        contentType: "text/html; charset=utf-8",
        body,
      });
      return { updatedAt, bytes };
    },
    async delete(organizationId, name) {
      objects.delete(objectKey(organizationId, name));
    },
    async list(organizationId) {
      const prefix = `${organizationId}/`;
      const heads: StoredHead[] = [];
      for (const [key, record] of objects) {
        if (key.startsWith(prefix)) heads.push(headOf(record));
      }
      return heads;
    },
    async copy(organizationId, from, to) {
      const source = objects.get(objectKey(organizationId, from));
      if (!source) throw new Error("Object not found.");
      const next: Recorded = { ...source, name: to, updatedAt: new Date() };
      objects.set(objectKey(organizationId, to), next);
      return headOf(next);
    },
  };

  return {
    store,
    setUploaded(organizationId, name, updatedAt) {
      const record = objects.get(objectKey(organizationId, name));
      if (record) record.updatedAt = updatedAt;
    },
    seedWithoutId(organizationId, name, body) {
      const bytes = new TextEncoder().encode(body).byteLength;
      objects.set(objectKey(organizationId, name), {
        name,
        id: null,
        updatedAt: new Date(),
        bytes,
        contentType: "text/html; charset=utf-8",
        body,
      });
    },
  };
}
