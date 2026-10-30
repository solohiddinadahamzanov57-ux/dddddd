import { createBrowserClient } from "@supabase/ssr";

import { getClientEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function createClient() {
  const env = getClientEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
