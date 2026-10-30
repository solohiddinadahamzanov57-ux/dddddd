import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BookingHeader } from "@/components/booking/booking-header";
import { VehicleCard3D } from "@/components/vehicles/vehicle-card-3d";
import { Link } from "@/i18n/navigation";
import { getPublicCompany, getPublicTariff, getPublicVehicle } from "@/lib/booking/data";
import { calculateReservationQuote } from "@/lib/billing/fees";
import { formatMinor } from "@/lib/billing/money";
import { createClient } from "@/lib/supabase/server";

export default async function BookingVehiclePage({
  params,
  searchParams,
}: PageProps<"/[locale]/book/[companySlug]/[vehicleId]">) {
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

  const reserveParams = new URLSearchParams({ startAt, endAt });

  return (
    <div className="flex flex-1 flex-col">
      <BookingHeader companyName={company.name} companySlug={companySlug} />
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)]">
          <div className="h-56 bg-[var(--color-surface)]">
            <VehicleCard3D
              modelGlbKey={vehicle.model_glb_key ?? "sedan.glb"}
              color={vehicle.color}
            />
          </div>
          <div className="p-4">
            <h1 className="text-xl text-[var(--color-text)]">{vehicle.model}</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {tFleet(`vehicleType.${vehicle.type}`)} &middot;{" "}
              {tFleet(`subtype.${vehicle.subtype}`)} &middot; {tFleet(`fuel.${vehicle.fuel_type}`)}
            </p>
          </div>
        </div>

        <section className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-4">
          <h2 className="text-lg text-[var(--color-text)]">{t("priceQuote")}</h2>
          <dl className="tabular flex flex-col gap-1 text-sm">
            <div className="flex justify-between text-[var(--color-text-muted)]">
              <dt>{t("subtotal")}</dt>
              <dd>{formatMinor(quote.subtotalMinor, tariff.currency, locale)}</dd>
            </div>
            <div className="flex justify-between text-[var(--color-text-muted)]">
              <dt>{t("tax")}</dt>
              <dd>{formatMinor(quote.taxMinor, tariff.currency, locale)}</dd>
            </div>
            <div className="flex justify-between font-medium text-[var(--color-text)]">
              <dt>{t("total")}</dt>
              <dd>{formatMinor(quote.totalMinor, tariff.currency, locale)}</dd>
            </div>
          </dl>
          <p className="text-xs text-[var(--color-text-muted)]">{t("priceDisclaimer")}</p>
        </section>

        <Link
          href={`/book/${companySlug}/${vehicleId}/reserve?${reserveParams.toString()}`}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-center text-sm font-medium text-[var(--color-accent-contrast)]"
        >
          {t("continueToReserve")}
        </Link>
      </main>
    </div>
  );
}
