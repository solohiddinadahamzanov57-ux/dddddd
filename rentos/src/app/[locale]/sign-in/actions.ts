"use server";

import { redirect } from "@/i18n/navigation";
import { emailPasswordSchema } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error?: string };

export async function signIn(
  locale: string,
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

  const { data: accounts } = await supabase.from("accounts").select("id").limit(1);
  return redirect({ href: accounts && accounts.length > 0 ? "/fleet" : "/onboarding", locale });
}
