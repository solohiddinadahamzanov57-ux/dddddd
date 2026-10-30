"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { VEHICLE_TYPES } from "@/lib/vehicles/types";

function defaultDateTime(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return d.toISOString().slice(0, 16);
}

export function SearchForm({ companySlug }: { companySlug: string }) {
  const t = useTranslations("booking");
  const tFleet = useTranslations("fleet");
  const router = useRouter();
  const searchParams = useSearchParams();

  const [startAt, setStartAt] = useState(searchParams.get("startAt") ?? defaultDateTime(24));
  const [endAt, setEndAt] = useState(searchParams.get("endAt") ?? defaultDateTime(48));
  const [type, setType] = useState(searchParams.get("type") ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams({ startAt, endAt });
    if (type) params.set("type", type);
    router.push(`/book/${companySlug}?${params.toString()}`);
  }

  const inputClass =
    "mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]";

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="block text-[var(--color-text)]">{t("pickup")}</span>
        <input
          type="datetime-local"
          value={startAt}
          onChange={(e) => setStartAt(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="text-sm">
        <span className="block text-[var(--color-text)]">{t("dropoff")}</span>
        <input
          type="datetime-local"
          value={endAt}
          onChange={(e) => setEndAt(e.target.value)}
          className={inputClass}
        />
      </label>
      <label className="text-sm">
        <span className="block text-[var(--color-text)]">{t("vehicleType")}</span>
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
          <option value="">{tFleet("allTypes")}</option>
          {VEHICLE_TYPES.map((vt) => (
            <option key={vt} value={vt}>
              {tFleet(`vehicleType.${vt}`)}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)]"
      >
        {t("search")}
      </button>
    </form>
  );
}
