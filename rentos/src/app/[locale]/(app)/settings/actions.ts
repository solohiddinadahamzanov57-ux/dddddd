"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { tariffFormSchema } from "@/lib/billing/schemas";
import { getStaffAccount } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";

export type TariffFormState = { error?: string };

export async function saveTariff(
  locale: string,
  _prevState: TariffFormState,
  formData: FormData,
): Promise<TariffFormState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return redirect({ href: "/sign-in", locale });
  }

  const account = await getStaffAccount(supabase, userData.user.id);
  if (!account) {
    return redirect({ href: "/onboarding", locale });
  }

  const parsed = tariffFormSchema.safeParse({
    vehicleType: formData.get("vehicleType") || undefined,
    currency: formData.get("currency"),
    hourlyRateMinor: formData.get("hourlyRateMinor"),
    dailyRateMinor: formData.get("dailyRateMinor"),
    weeklyRateMinor: formData.get("weeklyRateMinor"),
    gracePeriodMinutes: formData.get("gracePeriodMinutes"),
    lateFeePerHourMinor: formData.get("lateFeePerHourMinor"),
  });
  if (!parsed.success) {
    return { error: "errors.generic" };
  }

  const vehicleType = parsed.data.vehicleType || null;
  const fields = {
    currency: parsed.data.currency,
    hourly_rate_minor: parsed.data.hourlyRateMinor,
    daily_rate_minor: parsed.data.dailyRateMinor,
    weekly_rate_minor: parsed.data.weeklyRateMinor,
    grace_period_minutes: parsed.data.gracePeriodMinutes,
    late_fee_per_hour_minor: parsed.data.lateFeePerHourMinor,
  };

  // No single onConflict target covers both the plain unique(company_id,
  // vehicle_type) and the partial "one default per company" index, so this
  // is update-else-insert rather than a single upsert.
  const updateQuery = supabase.from("tariffs").update(fields).eq("company_id", account.company_id);
  const { data: updated, error: updateError } = vehicleType
    ? await updateQuery.eq("vehicle_type", vehicleType).select("id")
    : await updateQuery.is("vehicle_type", null).select("id");

  if (updateError) {
    console.error("saveTariff update failed:", updateError);
    return { error: "errors.generic" };
  }

  if (!updated || updated.length === 0) {
    const { error: insertError } = await supabase
      .from("tariffs")
      .insert({ ...fields, company_id: account.company_id, vehicle_type: vehicleType });
    if (insertError) {
      console.error("saveTariff insert failed:", insertError);
      return { error: "errors.generic" };
    }
  }

  revalidatePath("/settings/tariffs");
  return {};
}
