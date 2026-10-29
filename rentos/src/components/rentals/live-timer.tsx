"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { calculateRentalCharge, type TariffInput } from "@/lib/billing/fees";
import { formatMinor } from "@/lib/billing/money";

/**
 * Display-only running total -- ticks every second using the same pure
 * calculateRentalCharge the server uses at return, so the number here
 * matches what staff actually get charged (give or take the second between
 * "now" here and the server's own clock at the moment of return).
 */
export function LiveTimer({
  startedAt,
  expectedReturnAt,
  tariff,
  extrasMinor,
  currency,
  locale,
}: {
  startedAt: string;
  expectedReturnAt: string | null;
  tariff: TariffInput;
  extrasMinor: number;
  currency: string;
  locale: string;
}) {
  const t = useTranslations("rentals");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const start = new Date(startedAt);
  const charge = calculateRentalCharge({
    startedAt: start,
    endedAt: now,
    expectedReturnAt: expectedReturnAt ? new Date(expectedReturnAt) : null,
    tariff,
    extrasMinor,
  });

  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  const hh = Math.floor(elapsedSeconds / 3600);
  const mm = Math.floor((elapsedSeconds % 3600) / 60);
  const ss = elapsedSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <p className="tabular text-3xl text-[var(--color-text)]">
        {pad(hh)}:{pad(mm)}:{pad(ss)}
      </p>
      <p className="tabular text-sm text-[var(--color-text-muted)]">
        {t("estimatedSoFar")}: {formatMinor(charge.totalMinor, currency, locale)}
        {charge.lateFeeMinor > 0 && (
          <span className="text-[var(--color-status-service)]"> ({t("includesLateFee")})</span>
        )}
      </p>
    </div>
  );
}
