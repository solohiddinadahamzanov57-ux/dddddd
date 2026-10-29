"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Link } from "@/i18n/navigation";
import { FUEL_TYPES, VEHICLE_STATUSES, VEHICLE_TYPES } from "@/lib/vehicles/types";

const selectClass =
  "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]";

export function VehicleFilters() {
  const t = useTranslations("fleet");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function set(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => router.push(`?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        placeholder={t("searchPlaceholder")}
        defaultValue={searchParams.get("search") ?? ""}
        onChange={(e) => set("search", e.target.value)}
        className="min-w-48 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm text-[var(--color-text)]"
      />
      <select
        className={selectClass}
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => set("status", e.target.value)}
      >
        <option value="">{t("allStatuses")}</option>
        {VEHICLE_STATUSES.map((s) => (
          <option key={s} value={s}>
            {t(`status.${s}`)}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        defaultValue={searchParams.get("type") ?? ""}
        onChange={(e) => set("type", e.target.value)}
      >
        <option value="">{t("allTypes")}</option>
        {VEHICLE_TYPES.map((type) => (
          <option key={type} value={type}>
            {t(`vehicleType.${type}`)}
          </option>
        ))}
      </select>
      <select
        className={selectClass}
        defaultValue={searchParams.get("fuelType") ?? ""}
        onChange={(e) => set("fuelType", e.target.value)}
      >
        <option value="">{t("allFuelTypes")}</option>
        {FUEL_TYPES.map((f) => (
          <option key={f} value={f}>
            {t(`fuel.${f}`)}
          </option>
        ))}
      </select>
      <Link
        href="/fleet/scan"
        className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)]"
      >
        {t("scan")}
      </Link>
      <Link
        href="/fleet/new"
        className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)]"
      >
        {t("addVehicle")}
      </Link>
    </div>
  );
}
