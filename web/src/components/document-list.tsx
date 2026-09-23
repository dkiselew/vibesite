import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fetchDocuments, type DocumentsResponse } from "@/lib/api";
import { displayUrl, exactTime, formatBytes, relativeTime } from "@/lib/format";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: DocumentsResponse };

export function DocumentList() {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const data = await fetchDocuments();
      setState({ status: "ready", data });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Link copied");
    } catch {
      toast("Could not copy the link.");
    }
  }

  const workspace = state.status === "ready" ? state.data.workspace : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-6 py-10">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
          {workspace ? (
            <p className="mt-1 text-sm text-muted-foreground">Folder {workspace}</p>
          ) : null}
        </div>
        <Button variant="ghost" onClick={() => void load()} disabled={state.status === "loading"}>
          Refresh
        </Button>
      </header>

      <section className="rounded-lg border bg-card">
        {state.status === "loading" ? (
          <p className="px-6 py-16 text-center text-sm text-muted-foreground">Loading documents…</p>
        ) : null}

        {state.status === "error" ? (
          <div className="px-6 py-16 text-center">
            <p className="text-sm">Could not load documents.</p>
            <Button className="mt-4" variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        ) : null}

        {state.status === "ready" && state.data.documents.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <h2 className="text-base font-medium">No documents yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              An agent puts HTML in this folder through MCP. Saving makes the link live. There is
              no upload here.
            </p>
          </div>
        ) : null}

        {state.status === "ready" && state.data.documents.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Modified</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-24 text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.documents.map((document) => (
                <TableRow key={document.name}>
                  <TableCell className="font-medium" title={formatBytes(document.bytes)}>
                    {document.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground" title={exactTime(document.updated_at)}>
                    {relativeTime(document.updated_at)}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="max-w-md truncate text-left font-mono text-xs underline-offset-4 hover:underline"
                      title="Copy link"
                      onClick={() => void copyLink(document.url)}
                    >
                      {displayUrl(document.url)}
                    </button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="outline" size="sm" asChild>
                      <a href={document.url} target="_blank" rel="noreferrer">
                        Open
                      </a>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : null}
      </section>
    </main>
  );
}
