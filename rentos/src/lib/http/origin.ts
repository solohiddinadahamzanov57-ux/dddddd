import "server-only";

import { headers } from "next/headers";

/** The app's own base URL, derived from request headers so it works in any deployment without extra config. */
export async function getOrigin(): Promise<string> {
  const h = await headers();
  const proto =
    h.get("x-forwarded-proto") ?? (process.env.NODE_ENV === "development" ? "http" : "https");
  const host = h.get("host");
  return `${proto}://${host}`;
}
