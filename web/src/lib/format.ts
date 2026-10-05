export function relativeTime(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const seconds = Math.round((now - then) / 1000);
  if (Math.abs(seconds) < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) {
    return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) {
    return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) {
    return days === 1 ? "1 day ago" : `${days} days ago`;
  }
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(then);
}

export type UpdatedGroup = "today" | "week" | "month" | "older";

const UPDATED_GROUP_ORDER: UpdatedGroup[] = ["today", "week", "month", "older"];

export function updatedGroup(iso: string, now = Date.now()): UpdatedGroup {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "older";
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (then >= startOfToday.getTime()) return "today";
  const weekAgo = new Date(startOfToday);
  weekAgo.setDate(weekAgo.getDate() - 7);
  if (then >= weekAgo.getTime()) return "week";
  const monthAgo = new Date(startOfToday);
  monthAgo.setDate(monthAgo.getDate() - 30);
  if (then >= monthAgo.getTime()) return "month";
  return "older";
}

export function groupByUpdatedAt<T extends { updated_at: string }>(
  items: readonly T[],
  now = Date.now(),
): { id: UpdatedGroup; items: T[] }[] {
  const buckets: Record<UpdatedGroup, T[]> = { today: [], week: [], month: [], older: [] };
  for (const item of items) buckets[updatedGroup(item.updated_at, now)].push(item);
  return UPDATED_GROUP_ORDER.filter((id) => buckets[id].length > 0).map((id) => ({
    id,
    items: buckets[id],
  }));
}

export function exactTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}
