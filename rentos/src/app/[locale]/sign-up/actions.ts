"use server";

import { redirect } from "@/i18n/navigation";
import { emailPasswordSchema } from "@/lib/auth/schemas";
import { safeNextPath } from "@/lib/auth/next-path";
import { createClient } from "@/lib/supabase/server";

export type SignUpState = { error?: string; confirmEmail?: boolean };

export async function signUp(
  locale: string,
  next: string | null,
  _prevState: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = emailPasswordSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "errors.generic" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp(parsed.data);

  if (error) {
    return { error: "errors.generic" };
  }

  // Email confirmation is on by default for a new Supabase project -- no
  // session yet means there's nothing to onboard into until they confirm.
  if (!data.session) {
    return { confirmEmail: true };
  }

  const safeNext = safeNextPath(next);
  return redirect({ href: safeNext ?? "/onboarding", locale });
}
