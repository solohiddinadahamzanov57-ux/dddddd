import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Server-side Supabase client scoped to the current request's session cookies.
 * Runs with the signed-in user's JWT, so every query is still subject to RLS --
 * this is not a service-role client and must never be given elevated access.
 */
export async function createClient() {
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component -- middleware already refreshes the
            // session cookie on every request, so this can be safely ignored.
          }
        },
      },
    },
  );
}
