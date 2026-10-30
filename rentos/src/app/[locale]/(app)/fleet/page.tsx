import { getTranslations, setRequestLocale } from "next-intl/server";

import { VehicleFilters } from "@/components/vehicles/vehicle-filters";
import { VehicleListCard } from "@/components/vehicles/vehicle-list-card";
import { createClient } from "@/lib/supabase/server";
import { vehicleFiltersSchema } from "@/lib/vehicles/schemas";

export default async function FleetPage({ params, searchParams }: PageProps<"/[locale]/fleet">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("fleet");
  const tErrors = await getTranslations();

  const supabase = await createClient();
  const rawParams = await searchParams;
  const filters = vehicleFiltersSchema.parse({
    status: typeof rawParams.status === "string" ? rawParams.status : undefined,
    type: typeof rawParams.type === "string" ? rawParams.type : undefined,
    fuelType: typeof rawParams.fuelType === "string" ? rawParams.fuelType : undefined,
    search: typeof rawParams.search === "string" ? rawParams.search : undefined,
  });

  let query = supabase
    .from("vehicles")
    .select(
      "id, model, license_plate, odometer, color, status, fuel_type, fuel_or_charge_level, level_source, model_glb_key",
    )
    .order("created_at", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.fuelType) query = query.eq("fuel_type", filters.fuelType);
  if (filters.search) {
    const term = filters.search.replace(/[%_]/g, "");
    query = query.or(`license_plate.ilike.%${term}%,barcode.ilike.%${term}%,model.ilike.%${term}%`);
  }

  const { data: vehicles, error } = await query;
  if (error) console.error("fleet list query failed:", error);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-[var(--color-text)]">{t("title")}</h1>
      </div>
      <VehicleFilters />
      {error && (
        <p className="text-sm text-[var(--color-status-service)]">{tErrors("errors.generic")}</p>
      )}
      {vehicles && vehicles.length === 0 && (
        <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">{t("empty")}</p>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {vehicles?.map((vehicle) => (
          <VehicleListCard key={vehicle.id} vehicle={vehicle} />
        ))}
      </div>
    </main>
  );
}
