type Row = {
  body: string;
  uploaded: Date;
  httpMetadata: R2HTTPMetadata;
};

function objectView(key: string, row: Row): R2Object {
  const encoded = () => new TextEncoder().encode(row.body);
  return {
    key,
    get size() {
      return encoded().byteLength;
    },
    get uploaded() {
      return row.uploaded;
    },
    httpEtag: '"etag"',
    etag: "etag",
    version: "1",
    storageClass: "Standard",
    checksums: {},
    get httpMetadata() {
      return row.httpMetadata;
    },
    customMetadata: {},
    writeHttpMetadata(headers: Headers) {
      if (row.httpMetadata.contentType) headers.set("content-type", row.httpMetadata.contentType);
      if (row.httpMetadata.cacheControl) headers.set("cache-control", row.httpMetadata.cacheControl);
    },
  } as R2Object;
}

export function createMemoryBucket(): R2Bucket & {
  setUploaded(key: string, uploaded: Date): void;
} {
  const rows = new Map<string, Row>();

  const bucket = {
    setUploaded(key: string, uploaded: Date) {
      const row = rows.get(key);
      if (!row) throw new Error(`missing ${key}`);
      row.uploaded = uploaded;
    },
    async put(key: string, value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob, options?: R2PutOptions) {
      if (typeof value !== "string") {
        throw new Error("memory bucket only stores strings in this prototype");
      }
      const row: Row = {
        body: value,
        uploaded: new Date(),
        httpMetadata: { ...options?.httpMetadata },
      };
      rows.set(key, row);
      return objectView(key, row);
    },
    async get(key: string) {
      const row = rows.get(key);
      if (!row) return null;
      const view = objectView(key, row);
      return {
        ...view,
        body: new Blob([row.body]).stream(),
        bodyUsed: false,
        arrayBuffer: async () => new TextEncoder().encode(row.body).buffer,
        text: async () => row.body,
        json: async () => JSON.parse(row.body),
        blob: async () => new Blob([row.body]),
      } as R2ObjectBody;
    },
    async head(key: string) {
      const row = rows.get(key);
      return row ? objectView(key, row) : null;
    },
    async delete(key: string | string[]) {
      const keys = Array.isArray(key) ? key : [key];
      for (const item of keys) rows.delete(item);
    },
    async list(options?: R2ListOptions) {
      const objects = [...rows.entries()].map(([key, row]) => objectView(key, row));
      const limit = options?.limit ?? objects.length;
      return {
        objects: objects.slice(0, limit),
        truncated: false,
        delimitedPrefixes: [],
      } as R2Objects;
    },
    async createMultipartUpload() {
      throw new Error("not implemented");
    },
    resumeMultipartUpload() {
      throw new Error("not implemented");
    },
  };

  return bucket as unknown as R2Bucket & { setUploaded(key: string, uploaded: Date): void };
}
