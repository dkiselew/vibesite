export type StoredHead = {
  name: string;
  id: string | null;
  updatedAt: Date;
  bytes: number;
  contentType: string;
};

export type StoredObject = StoredHead & {
  body: string;
};

export type ObjectStore = {
  get(organizationId: string, name: string): Promise<StoredObject | null>;
  head(organizationId: string, name: string): Promise<StoredHead | null>;
  put(
    organizationId: string,
    name: string,
    body: string,
    meta: { id: string },
  ): Promise<{ updatedAt: Date; bytes: number }>;
  delete(organizationId: string, name: string): Promise<void>;
  list(organizationId: string): Promise<StoredHead[]>;
  copy(organizationId: string, from: string, to: string): Promise<StoredHead>;
};

const unavailable = async (): Promise<never> => {
  throw new Error("Object storage is not configured.");
};

export function unavailableStore(): ObjectStore {
  return {
    get: unavailable,
    head: unavailable,
    put: unavailable,
    delete: unavailable,
    list: unavailable,
    copy: unavailable,
  };
}

export function objectKey(organizationId: string, name: string): string {
  return `${organizationId}/${name}`;
}
