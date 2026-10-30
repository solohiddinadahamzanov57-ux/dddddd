import type { SupabaseClient } from "@supabase/supabase-js";

import type { VehicleType } from "@/lib/vehicles/types";
import type { Database } from "@/lib/supabase/types";

export async function getPublicCompany(supabase: SupabaseClient<Database>, slug: string) {
  const { data } = await supabase.rpc("public_company_by_slug", { p_slug: slug });
  return data?.[0] ?? null;
}

export async function getPublicVehicle(supabase: SupabaseClient<Database>, vehicleId: string) {
  const { data } = await supabase.rpc("public_vehicle_by_id", { p_vehicle_id: vehicleId });
  return data?.[0] ?? null;
}

export async function searchAvailableVehicles(
  supabase: SupabaseClient<Database>,
  params: { companySlug: string; startAt: string; endAt: string; type?: VehicleType },
) {
  const { data, error } = await supabase.rpc("search_available_vehicles", {
    p_company_slug: params.companySlug,
    p_start_at: params.startAt,
    p_end_at: params.endAt,
    p_type: params.type,
  });
  if (error) console.error("searchAvailableVehicles failed:", error);
  return data ?? [];
}

export async function getPublicTariff(
  supabase: SupabaseClient<Database>,
  params: { companySlug: string; vehicleType: VehicleType },
) {
  const { data } = await supabase.rpc("public_tariff_for_vehicle_type", {
    p_company_slug: params.companySlug,
    p_vehicle_type: params.vehicleType,
  });
  return data?.[0] ?? null;
}
