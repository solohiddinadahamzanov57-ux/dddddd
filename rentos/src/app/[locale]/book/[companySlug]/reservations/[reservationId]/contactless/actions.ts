"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { getDepositProvider } from "@/lib/contactless/deposit";
import { getIdentityProvider } from "@/lib/contactless/identity-provider";
import {
  contactlessErrorKey,
  isValidPhotoPath,
  type PhotoAngle,
  type PhotoPhase,
} from "@/lib/contactless/types";
import { getOrigin } from "@/lib/http/origin";
import { createClient } from "@/lib/supabase/server";

export type StepState = { error?: string; notice?: string };

const photoSchema = z.object({
  reservationId: z.string().uuid(),
  phase: z.enum(["pickup", "return"]),
  angle: z.enum(["front", "rear", "left", "right", "interior", "dashboard"]),
  path: z.string(),
});

async function currentUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

export async function requestIdentityCheck(
  reservationId: string,
  _prev: StepState,
  _formData: FormData,
): Promise<StepState> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "errors.generic" };

  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, company_id, member_account_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) return { error: "errors.generic" };

  const provider = getIdentityProvider();
  const started = await provider.start({ reservationId, customerEmail: user.email });
  if (started.redirectUrl) redirect(started.redirectUrl);

  const { error } = await supabase.from("identity_verifications").insert({
    company_id: reservation.company_id,
    reservation_id: reservation.id,
    member_account_id: reservation.member_account_id,
  });
  // 23505: already requested. Asking twice is not an error.
  if (error && error.code !== "23505") {
    console.error("requestIdentityCheck failed:", error);
    return { error: "errors.generic" };
  }
  return {};
}

export async function signAgreement(
  locale: string,
  reservationId: string,
  _prev: StepState,
  formData: FormData,
): Promise<StepState> {
  const parsed = z
    .object({ signedName: z.string().trim().min(2).max(200), agree: z.literal("on") })
    .safeParse({ signedName: formData.get("signedName"), agree: formData.get("agree") });
  if (!parsed.success) return { error: "errors.signatureRequired" };

  const { supabase, user } = await currentUser();
  if (!user) return { error: "errors.generic" };

  const { error } = await supabase.rpc("sign_rental_agreement", {
    p_reservation_id: reservationId,
    p_signed_name: parsed.data.signedName,
    p_locale: locale,
  });
  if (error) {
    console.error("sign_rental_agreement failed:", error);
    return { error: "errors.generic" };
  }
  return {};
}

export async function startDepositHold(
  locale: string,
  companySlug: string,
  reservationId: string,
  _prev: StepState,
  _formData: FormData,
): Promise<StepState> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "errors.generic" };

  // The amount comes from the company's tariff inside this function; nothing the browser sends is used.
  const { data: deposit, error } = await supabase.rpc("request_deposit", {
    p_reservation_id: reservationId,
  });
  if (error || !deposit) {
    console.error("request_deposit failed:", error);
    return { error: "errors.generic" };
  }
  if (deposit.status !== "pending") return {};

  const provider = getDepositProvider();
  if (!provider) return { notice: "contactless.deposit.manual" };

  const { data: reservation } = await supabase
    .from("reservations")
    .select("company_id, vehicles(model)")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) return { error: "errors.generic" };

  const back = `${await getOrigin()}/${locale}/book/${companySlug}/reservations/${reservationId}`;
  let url: string;
  try {
    ({ url } = await provider.createHold({
      reservationId,
      companyId: reservation.company_id,
      amountMinor: deposit.amount_minor,
      currency: deposit.currency,
      description: `Security deposit, ${reservation.vehicles?.model ?? "vehicle"}`,
      successUrl: back,
      cancelUrl: back,
    }));
  } catch (cause) {
    console.error("deposit hold failed:", cause);
    return { error: "errors.generic" };
  }
  redirect(url);
}

export async function recordHandoverPhoto(input: {
  reservationId: string;
  phase: PhotoPhase;
  angle: PhotoAngle;
  path: string;
}): Promise<StepState> {
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success || !isValidPhotoPath(parsed.data.path)) return { error: "errors.generic" };
  const { reservationId, phase, angle, path } = parsed.data;

  const { supabase, user } = await currentUser();
  if (!user) return { error: "errors.generic" };

  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, company_id, vehicle_id")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation || !path.startsWith(`${reservation.company_id}/${reservation.id}/${phase}/`)) {
    return { error: "errors.generic" };
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("id")
    .eq("user_id", user.id)
    .eq("company_id", reservation.company_id)
    .limit(1)
    .maybeSingle();
  if (!account) return { error: "errors.generic" };

  let rentalId: string | null = null;
  if (phase === "return") {
    const { data: rental } = await supabase
      .from("rentals")
      .select("id")
      .eq("reservation_id", reservationId)
      .eq("status", "active")
      .maybeSingle();
    if (!rental) return { error: "errors.rentalNotActive" };
    rentalId = rental.id;
  }

  const { error } = await supabase.from("handover_photos").insert({
    company_id: reservation.company_id,
    reservation_id: reservation.id,
    rental_id: rentalId,
    vehicle_id: reservation.vehicle_id,
    phase,
    angle,
    storage_path: path,
    taken_by_account_id: account.id,
  });
  if (error) {
    console.error("recordHandoverPhoto failed:", error);
    return { error: "errors.photoUploadFailed" };
  }
  return {};
}

export type UnlockState = StepState & { code?: string };

export async function unlockVehicle(
  reservationId: string,
  _prev: UnlockState,
  _formData: FormData,
): Promise<UnlockState> {
  const { supabase, user } = await currentUser();
  if (!user) return { error: "errors.generic" };

  const { data, error } = await supabase.rpc("start_contactless_pickup", {
    p_reservation_id: reservationId,
  });
  if (error) {
    if (error.message !== "checks_incomplete") console.error("unlock failed:", error);
    return { error: contactlessErrorKey(error.message) };
  }
  const code = data?.[0]?.keybox_code;
  return code ? { code } : { error: "errors.generic" };
}
