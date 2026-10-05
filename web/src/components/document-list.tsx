import { Bars3Icon, MagnifyingGlassIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { DocumentCard } from "@/components/document-card";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchDocuments, type DocumentsResponse } from "@/lib/api";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: DocumentsResponse };

type DocumentLayout = "grid" | "list";

export function DocumentList() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [query, setQuery] = useState("");
  const [layout, setLayout] = useState<DocumentLayout>("grid");

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

  const documents =
    state.status === "ready"
      ? state.data.documents.filter((document) =>
          document.name.toLowerCase().includes(query.trim().toLowerCase()),
        )
      : [];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-4xl font-semibold tracking-tight">Home</h1>
        <div className="flex items-center gap-2">
          <InputGroup className="min-w-0 flex-1 rounded-full bg-card sm:w-72 sm:flex-none">
            <InputGroupInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search documents..."
              aria-label="Search documents"
            />
            <InputGroupAddon>
              <MagnifyingGlassIcon />
            </InputGroupAddon>
          </InputGroup>
          <Tabs
            value={layout}
            onValueChange={(value) => {
              if (value === "grid" || value === "list") setLayout(value);
            }}
          >
            <TabsList>
              <TabsTrigger value="grid" aria-label="Grid">
                <Squares2X2Icon />
              </TabsTrigger>
              <TabsTrigger value="list" aria-label="List">
                <Bars3Icon />
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </header>

      {state.status === "loading" ? <DocumentSkeletons /> : null}

      {state.status === "error" ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Could not load documents.</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => void load()}>
              Retry
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {state.status === "ready" && state.data.documents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No documents yet</EmptyTitle>
            <EmptyDescription>
              An agent puts HTML in this folder through MCP. Saving makes the link live. There is no
              upload here.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {state.status === "ready" && state.data.documents.length > 0 && documents.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No matching documents</EmptyTitle>
            <EmptyDescription>Nothing in this folder matches that search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {state.status === "ready" && documents.length > 0 ? (
        <>
          <div
            hidden={layout !== "grid"}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3"
          >
            {documents.map((document) => (
              <DocumentCard key={document.name} document={document} layout="grid" />
            ))}
          </div>
          <div hidden={layout !== "list"} className="flex flex-col gap-4">
            {documents.map((document) => (
              <DocumentCard key={document.name} document={document} layout="list" />
            ))}
          </div>
        </>
      ) : null}
    </main>
  );
}

function DocumentSkeletons() {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 4 }, (_, index) => (
        <Card key={index} className="gap-0 overflow-hidden py-0">
          <Skeleton className="h-52 rounded-none" />
          <CardHeader>
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}
