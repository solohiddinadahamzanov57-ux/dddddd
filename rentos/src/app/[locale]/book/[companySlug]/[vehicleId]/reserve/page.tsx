import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BookingHeader } from "@/components/booking/booking-header";
import { calculateReservationQuote } from "@/lib/billing/fees";
import { formatMinor } from "@/lib/billing/money";
import { getPublicCompany, getPublicTariff, getPublicVehicle } from "@/lib/booking/data";
import { createClient } from "@/lib/supabase/server";

import { ConfirmForm } from "./confirm-form";

export default async function ReservePage({
  params,
  searchParams,
}: PageProps<"/[locale]/book/[companySlug]/[vehicleId]/reserve">) {
  const { locale, companySlug, vehicleId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("booking");
  const tFleet = await getTranslations("fleet");

  const rawParams = await searchParams;
  const startAt = typeof rawParams.startAt === "string" ? rawParams.startAt : null;
  const endAt = typeof rawParams.endAt === "string" ? rawParams.endAt : null;
  if (!startAt || !endAt) {
    notFound();
  }

  const supabase = await createClient();
  const [company, vehicle] = await Promise.all([
    getPublicCompany(supabase, companySlug),
    getPublicVehicle(supabase, vehicleId),
  ]);
  if (!company || !vehicle || vehicle.company_id !== company.id) {
    notFound();
  }

  const tariff = await getPublicTariff(supabase, { companySlug, vehicleType: vehicle.type });
  if (!tariff) {
    notFound();
  }

  const quote = calculateReservationQuote(new Date(startAt), new Date(endAt), {
    hourlyRateMinor: tariff.hourly_rate_minor,
    dailyRateMinor: tariff.daily_rate_minor,
    weeklyRateMinor: tariff.weekly_rate_minor,
    gracePeriodMinutes: tariff.grace_period_minutes,
    lateFeePerHourMinor: tariff.late_fee_per_hour_minor,
    taxRateBps: company.tax_rate_bps,
  });

  return (
    <div className="flex flex-1 flex-col">
      <BookingHeader companyName={company.name} companySlug={companySlug} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl text-[var(--color-text)]">{t("confirmTitle")}</h1>
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4">
          <p className="text-sm text-[var(--color-text)]">
            {vehicle.model} &middot; {tFleet(`vehicleType.${vehicle.type}`)}
          </p>
          <p className="tabular text-sm text-[var(--color-text-muted)]">
            {new Date(startAt).toLocaleString(locale)} &rarr;{" "}
            {new Date(endAt).toLocaleString(locale)}
          </p>
          <p className="tabular text-lg font-medium text-[var(--color-text)]">
            {formatMinor(quote.totalMinor, tariff.currency, locale)}
          </p>
        </section>
        <ConfirmForm
          locale={locale}
          companySlug={companySlug}
          vehicleId={vehicleId}
          startAt={startAt}
          endAt={endAt}
        />
      </main>
    </div>
  );
}
