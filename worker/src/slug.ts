const LABEL = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function slugFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  let slug = local
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length > 63) {
    slug = slug.slice(0, 63).replace(/-+$/g, "");
  }
  if (!slug || !LABEL.test(slug)) return "user";
  return slug;
}
