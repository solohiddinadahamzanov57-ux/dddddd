import { useTranslations } from "next-intl";

import type { VehicleStatus } from "@/lib/vehicles/types";

const COLOR: Record<VehicleStatus, { bg: string; fg: string }> = {
  available: { bg: "var(--color-status-available-bg)", fg: "var(--color-status-available)" },
  rented: { bg: "var(--color-status-rented-bg)", fg: "var(--color-status-rented)" },
  service: { bg: "var(--color-status-service-bg)", fg: "var(--color-status-service)" },
};

export function StatusBadge({ status }: { status: VehicleStatus }) {
  const t = useTranslations("fleet.status");
  const color = COLOR[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      {t(status)}
    </span>
  );
}
