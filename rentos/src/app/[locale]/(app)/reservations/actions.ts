"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getDepositProvider } from "@/lib/contactless/deposit";
import { notifyByEmail } from "@/lib/notifications/send";
import { getStaffAccount } from "@/lib/supabase/account";
import { createClient } from "@/lib/supabase/server";

export type StaffState = { error?: string };

async function staffContext() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const account = await getStaffAccount(supabase, data.user.id);
  return account ? { supabase, account } : null;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function confirmReservation(
  reservationId: string,
  _prev: StaffState,
  _formData: FormData,
): Promise<StaffState> {
  const ctx = await staffContext();
  if (!ctx) return { error: "errors.generic" };

  const { data: reservation, error } = await ctx.supabase
    .from("reservations")
    .update({ status: "confirmed" })
    .eq("id", reservationId)
    .eq("status", "pending")
    .select("id, company_id, member_account_id, start_at, end_at, vehicles(model)")
    .maybeSingle();
  if (error) {
    console.error("confirmReservation failed:", error);
    return { error: "errors.generic" };
  }

  if (reservation) {
    const { data: member } = await ctx.supabase
      .from("accounts")
      .select("email, full_name")
      .eq("id", reservation.member_account_id)
      .maybeSingle();
    if (member?.email) {
      await notifyByEmail({
        companyId: reservation.company_id,
        accountId: reservation.member_account_id,
        type: "reservation_confirmed",
        to: member.email,
        subject: "Your reservation is confirmed",
        text: `Your reservation for ${reservation.vehicles?.model ?? "your vehicle"} from ${reservation.start_at} to ${reservation.end_at} is confirmed. Open your reservation to finish the pickup steps.`,
      });
    }
  }

  refresh();
  return {};
}

export async function cancelReservationAsStaff(
  reservationId: string,
  _prev: StaffState,
  _formData: FormData,
): Promise<StaffState> {
  const ctx = await staffContext();
  if (!ctx) return { error: "errors.generic" };

  const { data: started } = await ctx.supabase
    .from("rentals")
    .select("id")
    .eq("reservation_id", reservationId)
    .limit(1)
    .maybeSingle();
  if (started) return { error: "errors.reservationNotCancellable" };

  const { error } = await ctx.supabase
    .from("reservations")
    .update({ status: "cancelled" })
    .eq("id", reservationId)
    .in("status", ["pending", "confirmed"]);
  if (error) {
    console.error("cancelReservationAsStaff failed:", error);
    return { error: "errors.generic" };
  }
  refresh();
  return {};
}

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  licenseValidUntil: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  ageConfirmed: z.literal("on").optional(),
});

export async function reviewIdentity(
  reservationId: string,
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  const ctx = await staffContext();
  if (!ctx) return { error: "errors.generic" };

  const parsed = reviewSchema.safeParse({
    decision: formData.get("decision"),
    licenseValidUntil: formData.get("licenseValidUntil") || undefined,
    ageConfirmed: formData.get("ageConfirmed") || undefined,
  });
  if (!parsed.success) return { error: "errors.generic" };

  const { decision, licenseValidUntil, ageConfirmed } = parsed.data;
  if (decision === "approve" && (!licenseValidUntil || !ageConfirmed)) {
    return { error: "errors.generic" };
  }

  const { error } = await ctx.supabase
    .from("identity_verifications")
    .update({
      status: decision === "approve" ? "approved" : "rejected",
      license_valid_until: decision === "approve" ? licenseValidUntil : null,
      age_confirmed: decision === "approve",
      reviewed_by_account_id: ctx.account.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq("reservation_id", reservationId)
    .eq("company_id", ctx.account.company_id);
  if (error) {
    console.error("reviewIdentity failed:", error);
    return { error: "errors.generic" };
  }
  refresh();
  return {};
}

export async function markDepositReceived(
  reservationId: string,
  _prev: StaffState,
  _formData: FormData,
): Promise<StaffState> {
  const ctx = await staffContext();
  if (!ctx) return { error: "errors.generic" };

  const { data: status } = await ctx.supabase.rpc("contactless_status", {
    p_reservation_id: reservationId,
  });
  const required = status?.[0]?.deposit_required_minor ?? 0;
  if (required <= 0) return { error: "errors.generic" };

  const { data: reservation } = await ctx.supabase
    .from("reservations")
    .select("company_id, currency")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) return { error: "errors.generic" };

  const { data: existing } = await ctx.supabase
    .from("reservation_deposits")
    .select("status")
    .eq("reservation_id", reservationId)
    .maybeSingle();

  const { error } = existing
    ? await ctx.supabase
        .from("reservation_deposits")
        .update({ status: "held", provider: "manual", amount_minor: required })
        .eq("reservation_id", reservationId)
        .eq("status", "pending")
    : await ctx.supabase.from("reservation_deposits").insert({
        reservation_id: reservationId,
        company_id: reservation.company_id,
        amount_minor: required,
        currency: reservation.currency,
        status: "held",
        provider: "manual",
      });
  if (error) {
    console.error("markDepositReceived failed:", error);
    return { error: "errors.generic" };
  }
  refresh();
  return {};
}

async function heldDeposit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reservationId: string,
) {
  const { data } = await supabase
    .from("reservation_deposits")
    .select("amount_minor, status, provider, provider_ref")
    .eq("reservation_id", reservationId)
    .eq("status", "held")
    .maybeSingle();
  return data;
}

export async function releaseDeposit(
  reservationId: string,
  _prev: StaffState,
  _formData: FormData,
): Promise<StaffState> {
  const ctx = await staffContext();
  if (!ctx) return { error: "errors.generic" };

  const deposit = await heldDeposit(ctx.supabase, reservationId);
  if (!deposit) return { error: "errors.generic" };

  try {
    if (deposit.provider === "stripe") {
      const provider = getDepositProvider();
      if (!provider || !deposit.provider_ref) return { error: "errors.generic" };
      await provider.release(deposit.provider_ref);
    }
  } catch (cause) {
    console.error("releaseDeposit: provider call failed:", cause);
    return { error: "errors.generic" };
  }

  const { error } = await ctx.supabase
    .from("reservation_deposits")
    .update({ status: "released" })
    .eq("reservation_id", reservationId)
    .eq("status", "held");
  if (error) {
    console.error("releaseDeposit update failed:", error);
    return { error: "errors.generic" };
  }
  refresh();
  return {};
}

export async function captureDeposit(
  reservationId: string,
  _prev: StaffState,
  formData: FormData,
): Promise<StaffState> {
  const ctx = await staffContext();
  if (!ctx) return { error: "errors.generic" };

  const amountMinor = Math.round(Number(formData.get("amount")) * 100);
  const deposit = await heldDeposit(ctx.supabase, reservationId);
  if (
    !deposit ||
    !Number.isFinite(amountMinor) ||
    amountMinor <= 0 ||
    amountMinor > deposit.amount_minor
  ) {
    return { error: "errors.generic" };
  }

  try {
    if (deposit.provider === "stripe") {
      const provider = getDepositProvider();
      if (!provider || !deposit.provider_ref) return { error: "errors.generic" };
      await provider.capture(deposit.provider_ref, amountMinor);
    }
  } catch (cause) {
    console.error("captureDeposit: provider call failed:", cause);
    return { error: "errors.generic" };
  }

  const { error } = await ctx.supabase
    .from("reservation_deposits")
    .update({ status: "captured" })
    .eq("reservation_id", reservationId)
    .eq("status", "held");
  if (error) {
    console.error("captureDeposit update failed:", error);
    return { error: "errors.generic" };
  }
  refresh();
  return {};
}
