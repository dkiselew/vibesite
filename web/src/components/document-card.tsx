import { EllipsisHorizontalIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { removeDocument, type DocumentRow } from "@/lib/api";
import { exactTime, relativeTime } from "@/lib/format";

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

function DocumentMenu({ name, onRemoved }: { name: string; onRemoved: (name: string) => void }) {
  const pending = useRef(false);

  async function remove() {
    if (pending.current) return;
    pending.current = true;
    try {
      await removeDocument(name);
      onRemoved(name);
    } catch {
      pending.current = false;
      toast.error("Could not remove document.");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-8 shrink-0 px-0 text-muted-foreground [&_svg]:size-4"
          aria-label={`Actions for ${name}`}
        >
          <EllipsisHorizontalIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
            <TrashIcon />
            Remove
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DocumentCard({
  document,
  onRemoved,
}: {
  document: DocumentRow;
  onRemoved: (name: string) => void;
}) {
  const updated = exactTime(document.updated_at);

  return (
    <Card className="gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <a href={document.url} target="_blank" rel="noreferrer" className="block">
        <DocumentPreview url={document.url} />
      </a>
      <CardHeader className="min-w-0 gap-0 py-4">
        <a href={document.url} target="_blank" rel="noreferrer" className="min-w-0">
          <CardTitle className="truncate">{document.name}</CardTitle>
        </a>
        <CardDescription className="-mt-1 flex items-center justify-between gap-2 text-xs">
          <span className="truncate" title={updated}>
            {relativeTime(document.updated_at)}
          </span>
          <DocumentMenu name={document.name} onRemoved={onRemoved} />
        </CardDescription>
      </CardHeader>
    </Card>
  );
}
