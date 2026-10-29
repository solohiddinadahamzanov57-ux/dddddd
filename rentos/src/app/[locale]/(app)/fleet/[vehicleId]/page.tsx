import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BarcodeDisplay } from "@/components/vehicles/barcode-display";
import { FuelGauge } from "@/components/vehicles/fuel-gauge";
import { StatusBadge } from "@/components/vehicles/status-badge";
import { VehicleCard3D } from "@/components/vehicles/vehicle-card-3d";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { createClient } from "@/lib/supabase/server";

import { updateVehicle } from "../actions";
import { DeleteButton, StatusControl } from "./status-control";
import { VehicleLog } from "./vehicle-log";

export default async function VehicleDetailPage({
  params,
}: PageProps<"/[locale]/fleet/[vehicleId]">) {
  const { locale, vehicleId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("fleet");

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("*")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!vehicle) {
    notFound();
  }

  const { data: logs } = await supabase
    .from("vehicle_logs")
    .select("id, event_type, occurred_at, payload, actor_account_id")
    .eq("vehicle_id", vehicleId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
        <div className="h-56 bg-[var(--color-surface)]">
          <VehicleCard3D modelGlbKey={vehicle.model_glb_key ?? "sedan.glb"} color={vehicle.color} />
        </div>
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h1 className="text-xl text-[var(--color-text)]">{vehicle.model}</h1>
              <p className="tabular text-sm text-[var(--color-text-muted)]">
                {vehicle.license_plate} &middot; {vehicle.odometer.toLocaleString()} mi &middot;{" "}
                {t("stall")} {vehicle.parking_stall ?? "—"}
              </p>
            </div>
            <StatusBadge status={vehicle.status} />
          </div>
          <FuelGauge
            level={vehicle.fuel_or_charge_level}
            fuelType={vehicle.fuel_type}
            source={vehicle.level_source}
          />
          <div className="flex items-center gap-3">
            <BarcodeDisplay value={vehicle.barcode} />
          </div>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg text-[var(--color-text)]">{t("changeStatus")}</h2>
        <StatusControl vehicleId={vehicle.id} currentStatus={vehicle.status} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg text-[var(--color-text)]">{t("editDetails")}</h2>
        <VehicleForm
          action={updateVehicle.bind(null, locale, vehicle.id)}
          submitLabel={t("saveChanges")}
          defaults={{
            model: vehicle.model,
            type: vehicle.type,
            subtype: vehicle.subtype,
            color: vehicle.color,
            licensePlate: vehicle.license_plate,
            parkingStall: vehicle.parking_stall ?? undefined,
            odometer: vehicle.odometer,
            fuelType: vehicle.fuel_type,
            fuelOrChargeLevel: Number(vehicle.fuel_or_charge_level),
            levelSource: vehicle.level_source,
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg text-[var(--color-text)]">{t("vehicleLog")}</h2>
        <VehicleLog entries={logs ?? []} />
      </section>

      <section className="border-t border-[var(--color-border)] pt-4">
        <DeleteButton locale={locale} vehicleId={vehicle.id} />
      </section>
    </main>
  );
}
