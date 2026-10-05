import { DocumentTextIcon } from "@heroicons/react/24/outline";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DocumentRow } from "@/lib/api";
import { exactTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type DocumentLayout = "grid" | "list";

function DocumentPreview({ url }: { url: string }) {
  return (
    <div className="relative h-52 overflow-hidden bg-card">
      <iframe
        title=""
        src={url}
        tabIndex={-1}
        loading="lazy"
        aria-hidden="true"
        className="pointer-events-none absolute top-0 left-0 h-[400%] w-[400%] origin-top-left scale-25 border-0"
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-card to-transparent" />
    </div>
  );
}

export function DocumentCard({
  document,
  layout,
}: {
  document: DocumentRow;
  layout: DocumentLayout;
}) {
  const updated = exactTime(document.updated_at);

  return (
    <a href={document.url} target="_blank" rel="noreferrer" className="block min-w-0">
      <Card
        className={cn(
          "gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md",
          layout === "list" && "flex-row items-center",
        )}
      >
        {layout === "grid" ? (
          <DocumentPreview url={document.url} />
        ) : (
          <DocumentTextIcon className="ml-6 size-8 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <CardHeader className={cn("py-4", layout === "list" && "min-w-0 flex-1")}>
          <CardTitle className="truncate">{document.name}</CardTitle>
          <CardDescription className="text-xs" title={updated}>
            {relativeTime(document.updated_at)}
          </CardDescription>
        </CardHeader>
      </Card>
    </a>
  );
}
