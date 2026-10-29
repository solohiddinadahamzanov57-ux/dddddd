import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";

import { getServerEnv } from "@/lib/env";

/**
 * Refreshes the Supabase auth session cookie on every request. Must run in
 * middleware (not just in Server Components) because Server Components can't
 * write cookies -- without this, sessions silently expire.
 *
 * Takes the response next-intl's middleware already produced (which may be a
 * locale redirect/rewrite) and only adds cookies to it, so the two
 * middlewares compose instead of one undoing the other's decision.
 */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const env = getServerEnv();

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // Required: touching getUser() is what actually triggers the refresh.
  await supabase.auth.getUser();

  return response;
}
