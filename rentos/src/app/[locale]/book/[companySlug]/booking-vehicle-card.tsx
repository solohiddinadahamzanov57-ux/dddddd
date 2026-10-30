import { useTranslations } from "next-intl";

import { VehicleCard3D } from "@/components/vehicles/vehicle-card-3d";
import { Link } from "@/i18n/navigation";

export function BookingVehicleCard({
  companySlug,
  startAt,
  endAt,
  vehicle,
}: {
  companySlug: string;
  startAt: string;
  endAt: string;
  vehicle: {
    vehicle_id: string;
    model: string;
    type: string;
    subtype: string;
    color: string;
    fuel_type: string;
    model_glb_key: string | null;
  };
}) {
  const t = useTranslations("fleet");
  const params = new URLSearchParams({ startAt, endAt });

  return (
    <Link
      href={`/book/${companySlug}/${vehicle.vehicle_id}?${params.toString()}`}
      className="flex flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]"
    >
      <div className="h-40 bg-[var(--color-surface)]">
        <VehicleCard3D modelGlbKey={vehicle.model_glb_key ?? "sedan.glb"} color={vehicle.color} />
      </div>
      <div className="flex flex-col gap-1 p-3">
        <h3 className="text-sm font-medium text-[var(--color-text)]">{vehicle.model}</h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {t(`vehicleType.${vehicle.type}`)} &middot; {t(`subtype.${vehicle.subtype}`)} &middot;{" "}
          {t(`fuel.${vehicle.fuel_type}`)}
        </p>
      </div>
    </Link>
  );
}
