"use server";

import { redirect } from "@/i18n/navigation";
import { createCompanySchema } from "@/lib/auth/schemas";
import { slugify } from "@/lib/slug";
import { createClient } from "@/lib/supabase/server";

export type CreateCompanyState = { error?: string };

export async function createCompany(
  locale: string,
  _prevState: CreateCompanyState,
  formData: FormData,
): Promise<CreateCompanyState> {
  const parsed = createCompanySchema.safeParse({
    name: formData.get("name"),
    defaultCurrency: formData.get("defaultCurrency"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) {
    return { error: "errors.companyNameRequired" };
  }

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) {
    return redirect({ href: "/sign-in", locale });
  }

  const { error } = await supabase.rpc("create_company", {
    p_name: parsed.data.name,
    p_slug: slugify(parsed.data.name),
    p_default_currency: parsed.data.defaultCurrency,
    p_default_locale: locale,
    p_timezone: parsed.data.timezone,
  });

  if (error) {
    return { error: error.message };
  }

  return redirect({ href: "/dashboard", locale });
}
