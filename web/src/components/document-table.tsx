import { DocumentTextIcon, TrashIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { removeDocument, type DocumentRow } from "@/lib/api";
import { exactTime, groupByUpdatedAt, relativeTime, type UpdatedGroup } from "@/lib/format";

const GROUP_LABEL: Record<UpdatedGroup, string> = {
  today: "Today",
  week: "7 days ago",
  month: "A month ago",
  older: "Older",
};

function RemoveDocumentButton({
  name,
  onRemoved,
}: {
  name: string;
  onRemoved: (name: string) => void;
}) {
  const [pending, setPending] = useState(false);

  async function remove() {
    if (pending) return;
    setPending(true);
    try {
      await removeDocument(name);
      onRemoved(name);
    } catch {
      setPending(false);
      toast.error("Could not remove document.");
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="size-8 px-0 text-muted-foreground hover:text-destructive [&_svg]:size-4"
      aria-label={`Remove ${name}`}
      disabled={pending}
      onClick={() => void remove()}
    >
      <TrashIcon />
    </Button>
  );
}

export function DocumentTable({
  documents,
  onRemoved,
}: {
  documents: DocumentRow[];
  onRemoved: (name: string) => void;
}) {
  const groups = groupByUpdatedAt(documents);

  return (
    <div className="overflow-hidden rounded-xl">
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-14" />
          <col />
          <col className="w-40" />
          <col className="w-16" />
        </colgroup>
        {groups.map((group) => (
          <tbody key={group.id}>
            <tr>
              <th colSpan={4} scope="rowgroup" className="p-0 font-medium">
                <div className="flex items-center gap-3 px-4 pt-3 pb-1">
                  <span className="shrink-0 text-xs text-muted-foreground">{GROUP_LABEL[group.id]}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              </th>
            </tr>
            {group.items.map((document) => {
              const updated = exactTime(document.updated_at);
              return (
                <tr key={document.name} className="hover:bg-accent/40">
                  <td className="px-4 py-2">
                    <a href={document.url} target="_blank" rel="noreferrer" className="inline-flex">
                      <DocumentTextIcon className="size-5 text-muted-foreground" aria-hidden="true" />
                    </a>
                  </td>
                  <td className="overflow-hidden px-2 py-2 font-medium">
                    <a href={document.url} target="_blank" rel="noreferrer" className="block truncate">
                      {document.name}
                    </a>
                  </td>
                  <td className="px-2 py-2 text-xs whitespace-nowrap text-muted-foreground" title={updated}>
                    {relativeTime(document.updated_at)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <RemoveDocumentButton name={document.name} onRemoved={onRemoved} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

export function DocumentTableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      {Array.from({ length: 5 }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-t px-4 py-3 first:border-t-0">
          <Skeleton className="size-5 shrink-0" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
    </div>
  );
}
