"use server";

import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut(locale: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/sign-in", locale });
}
