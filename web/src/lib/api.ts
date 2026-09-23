export type DocumentRow = {
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

export async function fetchDocuments(): Promise<DocumentsResponse> {
  const base = (import.meta.env.VITE_API_ORIGIN ?? "").replace(/\/$/, "");
  const response = await fetch(`${base}/api/documents`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Could not load documents (${response.status}).`);
  }
  return response.json() as Promise<DocumentsResponse>;
}
