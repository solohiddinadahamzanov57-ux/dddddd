"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { redirect } from "@/i18n/navigation";
import { calculateRentalCharge } from "@/lib/billing/fees";
import {
  checkoutFormSchema,
  extraItemSchema,
  returnFormSchema,
  type ExtraItem,
} from "@/lib/billing/schemas";
import {
  buildTariffSnapshot,
  parseTariffSnapshot,
  pickEffectiveTariff,
} from "@/lib/billing/tariff";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

const STAFF_ROLES = ["owner", "receptionist", "worker"];

type ActionState = { error?: string };

async function resolveOrCreateMember(
  companyId: string,
  input: {
    memberAccountId?: string;
    newMemberName?: string;
    newMemberEmail?: string;
    newMemberPhone?: string;
  },
): Promise<{ accountId: string } | { error: string }> {
  if (input.memberAccountId) {
    return { accountId: input.memberAccountId };
  }

  if (!input.newMemberName || !input.newMemberEmail) {
    return { error: "errors.memberRequired" };
  }

  // Walk-in customers don't go through Supabase Auth's normal signup --
  // staff create the account on their behalf. Needs the service-role client
  // since accounts has no client-facing INSERT policy (see Phase 0); the
  // company_id below is the caller's own, verified company, never anything
  // supplied by the form.
  const admin = createAdminClient();
  const { data: authUser, error: authError } = await admin.auth.admin.createUser({
    email: input.newMemberEmail,
    email_confirm: true,
    password: crypto.randomUUID(),
    user_metadata: { full_name: input.newMemberName },
  });
  if (authError || !authUser.user) {
    console.error("createUser (walk-in member) failed:", authError);
    return { error: "errors.generic" };
  }

  const { data: account, error: accountError } = await admin
    .from("accounts")
    .insert({
      user_id: authUser.user.id,
      company_id: companyId,
      role: "member",
      full_name: input.newMemberName,
      phone: input.newMemberPhone || null,
    })
    .select("id")
    .single();

  if (accountError || !account) {
    console.error("create walk-in member account failed:", accountError);
    return { error: "errors.generic" };
  }

  return { accountId: account.id };
}

export async function startRental(
  locale: string,
  vehicleId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return redirect({ href: "/sign-in", locale });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("company_id, role")
    .limit(1)
    .maybeSingle();
  if (!account) {
    return redirect({ href: "/onboarding", locale });
  }
  if (!STAFF_ROLES.includes(account.role)) {
    return { error: "errors.generic" };
  }

  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!vehicle) {
    return { error: "errors.generic" };
  }
  if (vehicle.status !== "available") {
    return { error: "errors.vehicleNotAvailable" };
  }

  let extras: ExtraItem[] = [];
  const extrasRaw = formData.get("extrasJson");
  if (typeof extrasRaw === "string" && extrasRaw) {
    const parsedExtras = z.array(extraItemSchema).safeParse(JSON.parse(extrasRaw));
    if (!parsedExtras.success) return { error: "errors.generic" };
    extras = parsedExtras.data;
  }

  const parsed = checkoutFormSchema.safeParse({
    memberAccountId: formData.get("memberAccountId") || undefined,
    newMemberName: formData.get("newMemberName") || undefined,
    newMemberEmail: formData.get("newMemberEmail") || undefined,
    newMemberPhone: formData.get("newMemberPhone") || undefined,
    expectedReturnAt: formData.get("expectedReturnAt") || undefined,
    extras,
  });
  if (!parsed.success) {
    return { error: "errors.generic" };
  }

  const memberResult = await resolveOrCreateMember(account.company_id, parsed.data);
  if ("error" in memberResult) {
    return memberResult;
  }

  const { data: tariffs } = await supabase
    .from("tariffs")
    .select("*")
    .eq("company_id", account.company_id);
  const tariff = pickEffectiveTariff(tariffs ?? [], vehicle.type);
  if (!tariff) {
    return { error: "errors.noTariff" };
  }

  const { data: company } = await supabase
    .from("companies")
    .select("tax_rate_bps")
    .eq("id", account.company_id)
    .single();
  const snapshot = buildTariffSnapshot(tariff, company?.tax_rate_bps ?? 0);

  const expectedReturnAt = parsed.data.expectedReturnAt
    ? new Date(parsed.data.expectedReturnAt).toISOString()
    : null;

  const { data: rental, error: rentalError } = await supabase
    .from("rentals")
    .insert({
      company_id: account.company_id,
      vehicle_id: vehicleId,
      member_account_id: memberResult.accountId,
      status: "active",
      started_at: new Date().toISOString(),
      odometer_start: vehicle.odometer,
      expected_return_at: expectedReturnAt,
      tariff_snapshot: snapshot as unknown as NonNullable<Json>,
      currency: snapshot.currency,
    })
    .select("id")
    .single();

  if (rentalError || !rental) {
    console.error("startRental insert failed:", rentalError);
    return {
      error: rentalError?.code === "23505" ? "errors.vehicleNotAvailable" : "errors.generic",
    };
  }

  if (parsed.data.extras.length > 0) {
    await supabase.from("rental_extras").insert(
      parsed.data.extras.map((e) => ({
        company_id: account.company_id,
        rental_id: rental.id,
        item_type: e.itemType,
        label: e.label,
        cost_minor: e.costMinor,
        currency: snapshot.currency,
      })),
    );
  }

  await supabase.from("vehicles").update({ status: "rented" }).eq("id", vehicleId);

  revalidatePath("/fleet");
  revalidatePath(`/fleet/${vehicleId}`);
  return redirect({ href: `/rentals/${rental.id}`, locale });
}

export async function completeRental(
  locale: string,
  rentalId: string,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return redirect({ href: "/sign-in", locale });
  }

  const parsed = returnFormSchema.safeParse({ odometerEnd: formData.get("odometerEnd") });
  if (!parsed.success) {
    return { error: "errors.generic" };
  }

  const { data: rental } = await supabase
    .from("rentals")
    .select("*")
    .eq("id", rentalId)
    .maybeSingle();
  if (!rental) {
    return { error: "errors.generic" };
  }
  if (rental.status !== "active") {
    return { error: "errors.rentalNotActive" };
  }
  if (parsed.data.odometerEnd < rental.odometer_start) {
    return { error: "errors.odometerTooLow" };
  }

  const tariffSnapshot = parseTariffSnapshot(rental.tariff_snapshot);
  if (!tariffSnapshot) {
    console.error("completeRental: unparseable tariff_snapshot on rental", rentalId);
    return { error: "errors.generic" };
  }

  const { data: extrasRows } = await supabase
    .from("rental_extras")
    .select("cost_minor")
    .eq("rental_id", rentalId);
  const extrasMinor = (extrasRows ?? []).reduce((sum, e) => sum + e.cost_minor, 0);

  const endedAt = new Date();
  const charge = calculateRentalCharge({
    startedAt: new Date(rental.started_at),
    endedAt,
    expectedReturnAt: rental.expected_return_at ? new Date(rental.expected_return_at) : null,
    tariff: tariffSnapshot,
    extrasMinor,
  });

  const { error } = await supabase
    .from("rentals")
    .update({
      status: "completed",
      ended_at: endedAt.toISOString(),
      odometer_end: parsed.data.odometerEnd,
      late_fee_minor: charge.lateFeeMinor,
      extras_minor: charge.extrasMinor,
      subtotal_minor: charge.subtotalMinor,
      tax_minor: charge.taxMinor,
      total_minor: charge.totalMinor,
    })
    .eq("id", rentalId);

  if (error) {
    console.error("completeRental update failed:", error);
    return { error: "errors.generic" };
  }

  await supabase
    .from("vehicles")
    .update({ status: "available", odometer: parsed.data.odometerEnd })
    .eq("id", rental.vehicle_id);

  revalidatePath("/fleet");
  revalidatePath(`/fleet/${rental.vehicle_id}`);
  revalidatePath(`/rentals/${rentalId}`);
  revalidatePath("/rentals");
  return redirect({ href: `/rentals/${rentalId}`, locale });
}
