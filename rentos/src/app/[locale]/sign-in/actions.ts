"use server";

import { redirect } from "@/i18n/navigation";
import { emailPasswordSchema } from "@/lib/auth/schemas";
import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error?: string };

export async function signIn(
  locale: string,
  next: string | null,
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = emailPasswordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "errors.invalidCredentials" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "errors.invalidCredentials" };
  }

  const safeNext = safeNextPath(next);
  if (safeNext) {
    return redirect({ href: safeNext, locale });
  }

  const { data: accounts } = await supabase.from("accounts").select("id").limit(1);
  return redirect({ href: accounts && accounts.length > 0 ? "/fleet" : "/onboarding", locale });
}
