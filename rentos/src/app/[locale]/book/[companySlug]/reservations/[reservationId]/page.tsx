import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BookingHeader } from "@/components/booking/booking-header";
import { formatMinor } from "@/lib/billing/money";
import { getPublicCompany } from "@/lib/booking/data";
import { isStripeConfigured } from "@/lib/stripe/client";
import { createClient } from "@/lib/supabase/server";

import { CancelForm } from "./cancel-form";
import { ContactlessSection } from "./contactless/section";

const STATUS_LABEL_KEY: Record<string, string> = {
  pending: "statusPending",
  confirmed: "statusConfirmed",
  cancelled: "statusCancelled",
  completed: "statusCompleted",
  no_show: "statusNoShow",
};

export default async function ReservationConfirmationPage({
  params,
}: PageProps<"/[locale]/book/[companySlug]/reservations/[reservationId]">) {
  const { locale, companySlug, reservationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("booking");

  const supabase = await createClient();
  const company = await getPublicCompany(supabase, companySlug);
  if (!company) {
    notFound();
  }

  const { data: reservation } = await supabase
    .from("reservations")
    .select("*, vehicles(model)")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) {
    notFound();
  }

  const { data: startedRental } = await supabase
    .from("rentals")
    .select("id")
    .eq("reservation_id", reservation.id)
    .limit(1)
    .maybeSingle();
  const isOpen = reservation.status === "pending" || reservation.status === "confirmed";
  const canCancel = isOpen && !startedRental;

  return (
    <div className="flex flex-1 flex-col">
      <BookingHeader companyName={company.name} companySlug={companySlug} />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8">
        <h1 className="text-2xl text-[var(--color-text)]">{t("reservationTitle")}</h1>

        <section className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <p className="text-sm text-[var(--color-text)]">{reservation.vehicles?.model}</p>
          <p className="tabular text-sm text-[var(--color-text-muted)]">
            {new Date(reservation.start_at).toLocaleString(locale)} &rarr;{" "}
            {new Date(reservation.end_at).toLocaleString(locale)}
          </p>
          <p className="tabular text-lg font-medium text-[var(--color-text)]">
            {formatMinor(reservation.total_minor, reservation.currency, locale)}
          </p>
          <p className="text-sm text-[var(--color-text)]">
            {t("status")}: {t(STATUS_LABEL_KEY[reservation.status] ?? "statusPending")}
          </p>
        </section>

        {reservation.status === "pending" && !isStripeConfigured() && (
          <p className="text-sm text-[var(--color-text-muted)]">{t("paymentNotConfigured")}</p>
        )}

        {isOpen && (
          <ContactlessSection locale={locale} companySlug={companySlug} reservation={reservation} />
        )}

        {canCancel && <CancelForm companySlug={companySlug} reservationId={reservation.id} />}
      </main>
    </div>
  );
}
