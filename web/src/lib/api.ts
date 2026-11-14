export type DocumentRow = {
  id: string | null;
  name: string;
  url: string;
  updated_at: string;
  bytes: number;
};

export type DocumentsResponse = {
  workspace: string;
  origin: string;
  documents: DocumentRow[];
};

export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in required.");
  }
}

function apiOrigin(): string {
  return (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
}

export async function fetchDocuments(): Promise<DocumentsResponse> {
  const response = await fetch(`${apiOrigin()}/api/documents`, {
    cache: "no-store",
    credentials: "include",
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) {
    throw new Error(`Could not load documents (${response.status}).`);
  }
  return response.json() as Promise<DocumentsResponse>;
}

export async function removeDocument(name: string): Promise<void> {
  const response = await fetch(`${apiOrigin()}/api/documents/${encodeURIComponent(name)}`, {
    method: "DELETE",
    credentials: "include",
  });
  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) {
    throw new Error(`Could not remove document (${response.status}).`);
  }
}
