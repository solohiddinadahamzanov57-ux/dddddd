import { useTranslations } from "next-intl";

import type { LevelSource } from "@/lib/vehicles/types";

export function FuelGauge({
  level,
  fuelType,
  source,
}: {
  level: number;
  fuelType: string;
  source: LevelSource;
}) {
  const t = useTranslations("fleet");
  const isElectric = fuelType === "electric";
  const low = level <= 15;

  return (
    <div className="flex items-center gap-2 text-xs">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--color-border)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${level}%`,
            backgroundColor: low ? "var(--color-status-service)" : "var(--color-accent)",
          }}
        />
      </div>
      <span className="tabular text-[var(--color-text)]">{Math.round(level)}%</span>
      <span className="text-[var(--color-text-muted)]">
        {isElectric ? t("chargeLabel") : t("fuelLabel")} &middot; {t(`levelSource.${source}`)}
      </span>
    </div>
  );
}
