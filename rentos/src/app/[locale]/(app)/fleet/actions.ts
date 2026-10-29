"use server";

import { revalidatePath } from "next/cache";

import { redirect } from "@/i18n/navigation";
import { expenseFormSchema } from "@/lib/billing/schemas";
import { randomBarcode } from "@/lib/vehicles/barcode";
import { statusChangeSchema, vehicleFormSchema } from "@/lib/vehicles/schemas";
import { modelGlbKeyFor } from "@/lib/vehicles/types";
import { createClient } from "@/lib/supabase/server";

export type VehicleFormState = { error?: string; fieldErrors?: Record<string, string> };

const UNIQUE_VIOLATION = "23505";
const MAX_BARCODE_ATTEMPTS = 5;

function parseVehicleForm(formData: FormData) {
  return vehicleFormSchema.safeParse({
    model: formData.get("model"),
    type: formData.get("type"),
    subtype: formData.get("subtype"),
    color: formData.get("color") ?? "",
    licensePlate: formData.get("licensePlate"),
    parkingStall: formData.get("parkingStall") || undefined,
    locationId: formData.get("locationId") || undefined,
    odometer: formData.get("odometer"),
    fuelType: formData.get("fuelType"),
    fuelOrChargeLevel: formData.get("fuelOrChargeLevel"),
    levelSource: formData.get("levelSource"),
  });
}

function fieldErrorsFrom(parsed: {
  success: false;
  error: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

export async function createVehicle(
  locale: string,
  _prevState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const parsed = parseVehicleForm(formData);
  if (!parsed.success) {
    return { error: "errors.generic", fieldErrors: fieldErrorsFrom(parsed) };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return redirect({ href: "/sign-in", locale });
  }

  const { data: account } = await supabase
    .from("accounts")
    .select("company_id")
    .limit(1)
    .maybeSingle();
  if (!account) {
    return redirect({ href: "/onboarding", locale });
  }

  const {
    model,
    type,
    subtype,
    color,
    licensePlate,
    parkingStall,
    locationId,
    odometer,
    fuelType,
    fuelOrChargeLevel,
    levelSource,
  } = parsed.data;

  let vehicleId: string | undefined;
  let lastError: { message: string; code?: string } | null = null;

  for (let attempt = 0; attempt < MAX_BARCODE_ATTEMPTS && !vehicleId; attempt++) {
    const { data, error } = await supabase
      .from("vehicles")
      .insert({
        company_id: account.company_id,
        barcode: randomBarcode(),
        license_plate: licensePlate,
        model,
        type,
        subtype,
        color,
        parking_stall: parkingStall ?? null,
        location_id: locationId ?? null,
        odometer,
        fuel_type: fuelType,
        fuel_or_charge_level: fuelOrChargeLevel,
        level_source: levelSource,
        model_glb_key: modelGlbKeyFor(subtype),
      })
      .select("id")
      .single();

    if (!error) {
      vehicleId = data.id;
      break;
    }
    lastError = error;
    if (error.code !== UNIQUE_VIOLATION) break;
  }

  if (!vehicleId) {
    if (lastError) console.error("createVehicle failed:", lastError);
    return { error: "errors.generic" };
  }

  revalidatePath("/fleet");
  return redirect({ href: `/fleet/${vehicleId}`, locale });
}

export async function updateVehicle(
  locale: string,
  vehicleId: string,
  _prevState: VehicleFormState,
  formData: FormData,
): Promise<VehicleFormState> {
  const parsed = parseVehicleForm(formData);
  if (!parsed.success) {
    return { error: "errors.generic", fieldErrors: fieldErrorsFrom(parsed) };
  }

  const {
    model,
    type,
    subtype,
    color,
    licensePlate,
    parkingStall,
    locationId,
    odometer,
    fuelType,
    fuelOrChargeLevel,
    levelSource,
  } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update({
      license_plate: licensePlate,
      model,
      type,
      subtype,
      color,
      parking_stall: parkingStall ?? null,
      location_id: locationId ?? null,
      odometer,
      fuel_type: fuelType,
      fuel_or_charge_level: fuelOrChargeLevel,
      level_source: levelSource,
      model_glb_key: modelGlbKeyFor(subtype),
    })
    .eq("id", vehicleId);

  if (error) {
    console.error("updateVehicle failed:", error);
    return { error: "errors.generic" };
  }

  revalidatePath("/fleet");
  revalidatePath(`/fleet/${vehicleId}`);
  return redirect({ href: `/fleet/${vehicleId}`, locale });
}

export async function changeVehicleStatus(
  vehicleId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = statusChangeSchema.safeParse({
    status: formData.get("status"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { error: "errors.generic" };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("vehicles")
    .update({ status: parsed.data.status })
    .eq("id", vehicleId);
  if (error) {
    console.error("changeVehicleStatus failed:", error);
    return { error: "errors.generic" };
  }

  if (parsed.data.note) {
    const { data: vehicle } = await supabase
      .from("vehicles")
      .select("company_id")
      .eq("id", vehicleId)
      .single();
    const { data: account } = await supabase.from("accounts").select("id").limit(1).maybeSingle();
    if (vehicle) {
      await supabase.from("vehicle_logs").insert({
        company_id: vehicle.company_id,
        vehicle_id: vehicleId,
        event_type: "note",
        actor_account_id: account?.id ?? null,
        payload: { note: parsed.data.note },
      });
    }
  }

  revalidatePath("/fleet");
  revalidatePath(`/fleet/${vehicleId}`);
  return {};
}

export async function deleteVehicle(
  locale: string,
  vehicleId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("vehicles").delete().eq("id", vehicleId);
  if (error) {
    // Foreign keys from reservations/rentals are ON DELETE RESTRICT on
    // purpose -- a vehicle with rental history should never silently vanish.
    if (error.code === "23503") {
      return { error: "errors.vehicleHasHistory" };
    }
    console.error("deleteVehicle failed:", error);
    return { error: "errors.generic" };
  }

  revalidatePath("/fleet");
  return redirect({ href: "/fleet", locale });
}

export async function addExpense(
  vehicleId: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = expenseFormSchema.safeParse({
    category: formData.get("category"),
    amountMinor: formData.get("amountMinor"),
    occurredOn: formData.get("occurredOn"),
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { error: "errors.generic" };
  }

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("company_id, companies(default_currency)")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!vehicle) {
    return { error: "errors.generic" };
  }
  const { data: account } = await supabase.from("accounts").select("id").limit(1).maybeSingle();

  const { error } = await supabase.from("expenses").insert({
    company_id: vehicle.company_id,
    vehicle_id: vehicleId,
    category: parsed.data.category,
    amount_minor: parsed.data.amountMinor,
    currency: vehicle.companies?.default_currency ?? "USD",
    occurred_on: parsed.data.occurredOn,
    notes: parsed.data.notes ?? "",
    created_by_account_id: account?.id ?? null,
  });

  if (error) {
    console.error("addExpense failed:", error);
    return { error: "errors.generic" };
  }

  revalidatePath(`/fleet/${vehicleId}`);
  return {};
}
