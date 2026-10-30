"use server";

import { redirect } from "@/i18n/navigation";
import { reservationFormSchema } from "@/lib/booking/schemas";
import { calculateReservationQuote } from "@/lib/billing/fees";
import { isStripeConfigured } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

export type CreateReservationState = { error?: string };

export async function createReservation(
  locale: string,
  companySlug: string,
  vehicleId: string,
  _prevState: CreateReservationState,
  formData: FormData,
): Promise<CreateReservationState> {
  const parsed = reservationFormSchema.safeParse({
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
  });
  if (!parsed.success) {
    return { error: "errors.generic" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    const next = `/book/${companySlug}/${vehicleId}/reserve?startAt=${encodeURIComponent(parsed.data.startAt)}&endAt=${encodeURIComponent(parsed.data.endAt)}`;
    return redirect({ href: `/sign-in?next=${encodeURIComponent(next)}`, locale });
  }

  const { data: account } = await supabase.rpc("join_company_as_member", {
    p_company_slug: companySlug,
  });
  if (!account) {
    return { error: "errors.generic" };
  }

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, company_id, type, status")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!vehicle || vehicle.company_id !== account.company_id) {
    return { error: "errors.generic" };
  }

  const { data: tariffs } = await supabase
    .from("tariffs")
    .select("*")
    .eq("company_id", account.company_id);
  const tariff =
    (tariffs ?? []).find((t) => t.vehicle_type === vehicle.type) ??
    (tariffs ?? []).find((t) => t.vehicle_type === null);
  if (!tariff) {
    return { error: "errors.noTariff" };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("tax_rate_bps")
    .eq("id", account.company_id)
    .single();

  const startAt = new Date(parsed.data.startAt);
  const endAt = new Date(parsed.data.endAt);
  if (endAt <= startAt) {
    return { error: "errors.generic" };
  }

  const quote = calculateReservationQuote(startAt, endAt, {
    hourlyRateMinor: tariff.hourly_rate_minor,
    dailyRateMinor: tariff.daily_rate_minor,
    weeklyRateMinor: tariff.weekly_rate_minor,
    gracePeriodMinutes: tariff.grace_period_minutes,
    lateFeePerHourMinor: tariff.late_fee_per_hour_minor,
    taxRateBps: company?.tax_rate_bps ?? 0,
  });

  const { data: reservation, error: reservationError } = await supabase
    .from("reservations")
    .insert({
      company_id: account.company_id,
      vehicle_id: vehicleId,
      member_account_id: account.id,
      status: "pending",
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      currency: tariff.currency,
      tariff_snapshot: {
        tariffId: tariff.id,
        currency: tariff.currency,
        hourlyRateMinor: tariff.hourly_rate_minor,
        dailyRateMinor: tariff.daily_rate_minor,
        weeklyRateMinor: tariff.weekly_rate_minor,
        gracePeriodMinutes: tariff.grace_period_minutes,
        lateFeePerHourMinor: tariff.late_fee_per_hour_minor,
        taxRateBps: company?.tax_rate_bps ?? 0,
      },
      subtotal_minor: quote.subtotalMinor,
      tax_minor: quote.taxMinor,
      total_minor: quote.totalMinor,
    })
    .select("id")
    .single();

  if (reservationError || !reservation) {
    console.error("createReservation failed:", reservationError);
    if (reservationError?.code === "23P01") {
      // Exclusion constraint violation: someone booked this slot first.
      return { error: "errors.vehicleNotAvailable" };
    }
    return { error: "errors.generic" };
  }

  if (!isStripeConfigured()) {
    return redirect({ href: `/book/${companySlug}/reservations/${reservation.id}`, locale });
  }

  return redirect({ href: `/book/${companySlug}/reservations/${reservation.id}/pay`, locale });
}
