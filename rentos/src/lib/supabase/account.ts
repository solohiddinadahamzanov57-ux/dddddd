import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

export const STAFF_ROLES = ["owner", "receptionist", "worker"] as const;

/**
 * The signed-in user's own staff account, with its company.
 *
 * Staff can read every account in their company (customers included), so a
 * bare `from("accounts").limit(1)` can return someone else's row. Always
 * filter by the caller's user id, and by staff role where the page or action
 * is operator-only.
 */
export async function getStaffAccount(supabase: SupabaseClient<Database>, userId: string) {
  const { data } = await supabase
    .from("accounts")
    .select("id, company_id, role, companies(name, slug, default_currency)")
    .eq("user_id", userId)
    .in("role", [...STAFF_ROLES])
    .limit(1)
    .maybeSingle();
  return data;
}
