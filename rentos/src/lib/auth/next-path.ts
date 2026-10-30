/**
 * Validates a client-supplied "return to this page after auth" path.
 * Only ever used to redirect within our own booking flow -- anything else
 * (an absolute URL, a protocol-relative "//evil.com", a path outside
 * "/book/") is rejected rather than followed, to avoid turning the sign-in
 * flow into an open redirect.
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/book/")) return null;
  if (next.startsWith("//") || next.includes("://")) return null;
  return next;
}
