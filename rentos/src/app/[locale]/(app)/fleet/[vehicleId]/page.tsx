import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BarcodeDisplay } from "@/components/vehicles/barcode-display";
import { FuelGauge } from "@/components/vehicles/fuel-gauge";
import { StatusBadge } from "@/components/vehicles/status-badge";
import { VehicleCard3D } from "@/components/vehicles/vehicle-card-3d";
import { VehicleForm } from "@/components/vehicles/vehicle-form";
import { Link } from "@/i18n/navigation";
import { formatMinor } from "@/lib/billing/money";
import { createClient } from "@/lib/supabase/server";

import { addExpense, saveKeyboxCode, updateVehicle } from "../actions";
import { ExpenseForm } from "./expense-form";
import { KeyboxForm } from "./keybox-form";
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

  const { data: activeRental } =
    vehicle.status === "rented"
      ? await supabase
          .from("rentals")
          .select("id")
          .eq("vehicle_id", vehicleId)
          .eq("status", "active")
          .maybeSingle()
      : { data: null };

  const { data: keybox } = await supabase
    .from("vehicle_keyboxes")
    .select("code")
    .eq("vehicle_id", vehicleId)
    .maybeSingle();

  const { data: expenses } = await supabase
    .from("expenses")
    .select("id, category, amount_minor, currency, occurred_on, notes")
    .eq("vehicle_id", vehicleId)
    .order("occurred_on", { ascending: false })
    .limit(20);

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
          {vehicle.status === "available" && (
            <Link
              href={`/fleet/${vehicle.id}/checkout`}
              className="self-start rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)]"
            >
              {t("checkOut")}
            </Link>
          )}
          {vehicle.status === "rented" && activeRental && (
            <Link
              href={`/rentals/${activeRental.id}`}
              className="self-start rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)]"
            >
              {t("viewActiveRental")}
            </Link>
          )}
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
        <h2 className="text-lg text-[var(--color-text)]">{t("keybox.title")}</h2>
        <KeyboxForm action={saveKeyboxCode.bind(null, vehicle.id)} currentCode={keybox?.code} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg text-[var(--color-text)]">{t("vehicleLog")}</h2>
        <VehicleLog entries={logs ?? []} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg text-[var(--color-text)]">{t("expenses")}</h2>
        <ExpenseForm action={addExpense.bind(null, vehicle.id)} />
        {expenses && expenses.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {expenses.map((e) => (
              <li key={e.id} className="flex justify-between text-[var(--color-text)]">
                <span>
                  {t(`expenseCategoryLabel.${e.category}`)}
                  {e.notes && (
                    <span className="text-[var(--color-text-muted)]"> &middot; {e.notes}</span>
                  )}
                </span>
                <span className="tabular shrink-0">
                  {formatMinor(e.amount_minor, e.currency, locale)} &middot; {e.occurred_on}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-[var(--color-border)] pt-4">
        <DeleteButton locale={locale} vehicleId={vehicle.id} />
      </section>
    </main>
  );
}
