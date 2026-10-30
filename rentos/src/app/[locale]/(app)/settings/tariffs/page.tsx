import { getTranslations, setRequestLocale } from "next-intl/server";

import { createClient } from "@/lib/supabase/server";

import { saveTariff } from "../actions";
import { TariffForm } from "./tariff-form";

export default async function TariffsSettingsPage({
  params,
}: PageProps<"/[locale]/settings/tariffs">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("tariffs");

  const supabase = await createClient();
  const { data: tariffs } = await supabase.from("tariffs").select("*");

  const defaultTariff = tariffs?.find((tf) => tf.vehicle_type === null);
  const perType = (tariffs ?? []).filter((tf) => tf.vehicle_type !== null);

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
      <div>
        <h1 className="text-2xl text-[var(--color-text)]">{t("title")}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{t("subtitle")}</p>
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-[var(--color-text)]">{t("defaultTariff")}</h2>
        <TariffForm
          action={saveTariff.bind(null, locale)}
          defaults={
            defaultTariff
              ? {
                  currency: defaultTariff.currency,
                  hourlyRateMinor: defaultTariff.hourly_rate_minor,
                  dailyRateMinor: defaultTariff.daily_rate_minor,
                  weeklyRateMinor: defaultTariff.weekly_rate_minor,
                  gracePeriodMinutes: defaultTariff.grace_period_minutes,
                  lateFeePerHourMinor: defaultTariff.late_fee_per_hour_minor,
                  depositMinor: defaultTariff.deposit_minor,
                }
              : undefined
          }
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg text-[var(--color-text)]">{t("perTypeTariffs")}</h2>
        {perType.map((tf) => (
          <TariffForm
            key={tf.id}
            action={saveTariff.bind(null, locale)}
            allowTypeSelect
            defaults={{
              vehicleType: tf.vehicle_type ?? undefined,
              currency: tf.currency,
              hourlyRateMinor: tf.hourly_rate_minor,
              dailyRateMinor: tf.daily_rate_minor,
              weeklyRateMinor: tf.weekly_rate_minor,
              gracePeriodMinutes: tf.grace_period_minutes,
              lateFeePerHourMinor: tf.late_fee_per_hour_minor,
              depositMinor: tf.deposit_minor,
            }}
          />
        ))}
        <h3 className="text-sm font-medium text-[var(--color-text)]">{t("addPerTypeTariff")}</h3>
        <TariffForm action={saveTariff.bind(null, locale)} allowTypeSelect />
      </section>
    </main>
  );
}
