import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { formatMinor } from "@/lib/billing/money";
import { parseTariffSnapshot } from "@/lib/billing/tariff";
import { createClient } from "@/lib/supabase/server";

import { LiveTimer } from "@/components/rentals/live-timer";

import { ReturnForm } from "./return-form";

export default async function RentalDetailPage({
  params,
}: PageProps<"/[locale]/rentals/[rentalId]">) {
  const { locale, rentalId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("rentals");

  const supabase = await createClient();
  const { data: rental } = await supabase
    .from("rentals")
    .select("*, vehicles(model, license_plate), accounts!rentals_member_account_id_fkey(full_name)")
    .eq("id", rentalId)
    .maybeSingle();

  if (!rental) {
    notFound();
  }

  const { data: extras } = await supabase
    .from("rental_extras")
    .select("id, item_type, label, cost_minor")
    .eq("rental_id", rentalId);

  const extrasTotal = (extras ?? []).reduce((sum, e) => sum + e.cost_minor, 0);
  const tariffSnapshot = parseTariffSnapshot(rental.tariff_snapshot);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <Link
          href={`/fleet/${rental.vehicle_id}`}
          className="text-sm text-[var(--color-accent)] underline"
        >
          {rental.vehicles?.model}
        </Link>
        <h1 className="text-2xl text-[var(--color-text)]">
          {t("rentalFor")} {rental.accounts?.full_name}
        </h1>
        <p className="tabular text-sm text-[var(--color-text-muted)]">
          {t("startedAt")} {new Date(rental.started_at).toLocaleString(locale)}
        </p>
      </div>

      {rental.status === "active" && tariffSnapshot && (
        <>
          <LiveTimer
            startedAt={rental.started_at}
            expectedReturnAt={rental.expected_return_at}
            tariff={tariffSnapshot}
            extrasMinor={extrasTotal}
            currency={rental.currency}
            locale={locale}
          />
          <section className="flex flex-col gap-2">
            <h2 className="text-lg text-[var(--color-text)]">{t("returnVehicle")}</h2>
            <ReturnForm
              locale={locale}
              rentalId={rental.id}
              odometerStart={rental.odometer_start}
            />
          </section>
        </>
      )}

      {rental.status === "completed" && (
        <section className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <h2 className="text-lg text-[var(--color-text)]">{t("finalCharge")}</h2>
          <dl className="tabular flex flex-col gap-1 text-sm">
            <Row
              label={t("subtotal")}
              value={formatMinor(rental.subtotal_minor, rental.currency, locale)}
            />
            {rental.late_fee_minor > 0 && (
              <Row
                label={t("lateFee")}
                value={formatMinor(rental.late_fee_minor, rental.currency, locale)}
              />
            )}
            {rental.extras_minor > 0 && (
              <Row
                label={t("extras")}
                value={formatMinor(rental.extras_minor, rental.currency, locale)}
              />
            )}
            <Row label={t("tax")} value={formatMinor(rental.tax_minor, rental.currency, locale)} />
            <Row
              label={t("total")}
              value={formatMinor(rental.total_minor, rental.currency, locale)}
              strong
            />
          </dl>
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("returnedAt")} {rental.ended_at && new Date(rental.ended_at).toLocaleString(locale)}
          </p>
        </section>
      )}

      {extras && extras.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg text-[var(--color-text)]">{t("extras")}</h2>
          <ul className="flex flex-col gap-1 text-sm text-[var(--color-text)]">
            {extras.map((e) => (
              <li key={e.id} className="flex justify-between">
                <span>
                  {t(`extraType.${e.item_type}`)} &middot; {e.label}
                </span>
                <span className="tabular">
                  {formatMinor(e.cost_minor, rental.currency, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={`flex justify-between ${strong ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}
    >
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
