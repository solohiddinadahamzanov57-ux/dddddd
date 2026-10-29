import { FuelGauge } from "@/components/vehicles/fuel-gauge";
import { StatusBadge } from "@/components/vehicles/status-badge";
import { VehicleCard3D } from "@/components/vehicles/vehicle-card-3d";
import { Link } from "@/i18n/navigation";
import type { FuelType, LevelSource, VehicleStatus } from "@/lib/vehicles/types";

export interface VehicleListItem {
  id: string;
  model: string;
  license_plate: string;
  odometer: number;
  color: string;
  status: VehicleStatus;
  fuel_type: FuelType;
  fuel_or_charge_level: number;
  level_source: LevelSource;
  model_glb_key: string | null;
}

export function VehicleListCard({ vehicle }: { vehicle: VehicleListItem }) {
  return (
    <Link
      href={`/fleet/${vehicle.id}`}
      className="flex flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]"
    >
      <div className="h-40 bg-[var(--color-surface)]">
        <VehicleCard3D modelGlbKey={vehicle.model_glb_key ?? "sedan.glb"} color={vehicle.color} />
      </div>
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-medium text-[var(--color-text)]">{vehicle.model}</h3>
          <StatusBadge status={vehicle.status} />
        </div>
        <p className="tabular text-sm text-[var(--color-text-muted)]">
          {vehicle.license_plate} &middot; {vehicle.odometer.toLocaleString()} mi
        </p>
        <FuelGauge
          level={vehicle.fuel_or_charge_level}
          fuelType={vehicle.fuel_type}
          source={vehicle.level_source}
        />
      </div>
    </Link>
  );
}
