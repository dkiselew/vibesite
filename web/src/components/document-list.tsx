import {
  Bars3Icon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import { useCallback, useEffect, useState } from "react";
import { DocumentCard } from "@/components/document-card";
import { DocumentTable, DocumentTableSkeleton } from "@/components/document-table";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { authClient } from "@/lib/auth-client";
import { fetchDocuments, UnauthorizedError, type DocumentsResponse } from "@/lib/api";
import { cursorMcpInstallHref } from "@/lib/cursor-mcp";

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
    } catch (error) {
      if (error instanceof UnauthorizedError) {
        window.location.assign("/sign-in");
        return;
      }
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

  function removeFromList(name: string) {
    setState((current) => {
      if (current.status !== "ready") return current;
      return {
        status: "ready",
        data: {
          ...current.data,
          documents: current.data.documents.filter((document) => document.name !== name),
        },
      };
    });
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-4xl font-semibold tracking-tight">My workspace</h1>
        <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <InputGroup className="w-full min-w-0 rounded-full bg-card sm:w-72 sm:flex-none">
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
          <AddToCursorButton />
          <UserMenu />
        </div>
      </header>

      {state.status === "loading" ? (
        layout === "list" ? (
          <DocumentTableSkeleton />
        ) : (
          <DocumentSkeletons />
        )
      ) : null}

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
          <EmptyContent>
            <AddToCursorButton />
          </EmptyContent>
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
              <DocumentCard key={document.name} document={document} onRemoved={removeFromList} />
            ))}
          </div>
          <div hidden={layout !== "list"}>
            <DocumentTable documents={documents} onRemoved={removeFromList} />
          </div>
        </>
      ) : null}
    </main>
  );
}

function CursorIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="currentColor">
      <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
    </svg>
  );
}

function UserMenu() {
  const { data: session, isPending } = authClient.useSession();
  const name = session?.user.name || session?.user.email || "Account";

  if (isPending) {
    return <Skeleton className="h-9 w-32" />;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="max-w-48 [&_svg]:size-5">
          <UserCircleIcon data-icon="inline-start" />
          <span className="truncate">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <a href="/docs">Документация</a>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              void authClient.signOut().then(() => {
                window.location.assign("/sign-in");
              });
            }}
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AddToCursorButton() {
  return (
    <Button variant="outline" asChild>
      <a href={cursorMcpInstallHref()}>
        <CursorIcon className="size-4 shrink-0" />
        Add to Cursor
      </a>
    </Button>
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
