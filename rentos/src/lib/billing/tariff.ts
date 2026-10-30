import type { TariffInput } from "@/lib/billing/fees";
import type { Database } from "@/lib/supabase/types";

type TariffRow = Database["public"]["Tables"]["tariffs"]["Row"];

/** The tariff to actually snapshot/bill with: the vehicle-type-specific one if set, else the company default. */
export function pickEffectiveTariff(tariffs: TariffRow[], vehicleType: string): TariffRow | null {
  return (
    tariffs.find((t) => t.vehicle_type === vehicleType) ??
    tariffs.find((t) => t.vehicle_type === null) ??
    null
  );
}

/** What gets frozen into reservations/rentals.tariff_snapshot at the moment it's used. */
export interface TariffSnapshot extends TariffInput {
  tariffId: string;
  currency: string;
}

export function buildTariffSnapshot(tariff: TariffRow, taxRateBps: number): TariffSnapshot {
  return {
    tariffId: tariff.id,
    currency: tariff.currency,
    hourlyRateMinor: tariff.hourly_rate_minor,
    dailyRateMinor: tariff.daily_rate_minor,
    weeklyRateMinor: tariff.weekly_rate_minor,
    gracePeriodMinutes: tariff.grace_period_minutes,
    lateFeePerHourMinor: tariff.late_fee_per_hour_minor,
    taxRateBps,
  };
}

export function parseTariffSnapshot(value: unknown): TariffSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.hourlyRateMinor !== "number" ||
    typeof v.dailyRateMinor !== "number" ||
    typeof v.weeklyRateMinor !== "number" ||
    typeof v.gracePeriodMinutes !== "number" ||
    typeof v.lateFeePerHourMinor !== "number" ||
    typeof v.taxRateBps !== "number" ||
    typeof v.currency !== "string"
  ) {
    return null;
  }
  return v as unknown as TariffSnapshot;
}
