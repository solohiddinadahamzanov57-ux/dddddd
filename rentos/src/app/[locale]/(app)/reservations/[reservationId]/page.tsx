import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";

import { Link } from "@/i18n/navigation";
import { PhotoGallery } from "@/components/reservations/photo-gallery";
import { formatMinor } from "@/lib/billing/money";
import { createClient } from "@/lib/supabase/server";

import {
  cancelReservationAsStaff,
  captureDeposit,
  confirmReservation,
  markDepositReceived,
  releaseDeposit,
  reviewIdentity,
} from "../actions";
import { ActionButton, CaptureForm, IdentityReviewForm } from "../forms";

function Card({
  title,
  state,
  children,
}: {
  title: string;
  state?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base text-[var(--color-text)]">{title}</h2>
        {state}
      </div>
      {children}
    </section>
  );
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: ok ? "var(--color-status-available-bg)" : "var(--color-status-rented-bg)",
        color: ok ? "var(--color-status-available)" : "var(--color-status-rented)",
      }}
    >
      {ok ? "✓" : "…"}
    </span>
  );
}

export default async function ReservationDetailPage({
  params,
}: PageProps<"/[locale]/reservations/[reservationId]">) {
  const { locale, reservationId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("reservations");

  const supabase = await createClient();
  const { data: reservation } = await supabase
    .from("reservations")
    .select(
      "*, vehicles(model, license_plate), accounts!reservations_member_account_id_fkey(full_name, email)",
    )
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation) {
    notFound();
  }

  const [statusResult, identityResult, agreementResult, depositResult, photosResult, rentalResult] =
    await Promise.all([
      supabase.rpc("contactless_status", { p_reservation_id: reservationId }),
      supabase
        .from("identity_verifications")
        .select("status, license_valid_until")
        .eq("reservation_id", reservationId)
        .maybeSingle(),
      supabase
        .from("rental_agreements")
        .select("signed_name, signed_at, contract_text")
        .eq("reservation_id", reservationId)
        .maybeSingle(),
      supabase
        .from("reservation_deposits")
        .select("status, amount_minor, currency, provider")
        .eq("reservation_id", reservationId)
        .maybeSingle(),
      supabase
        .from("handover_photos")
        .select("id, phase, angle, storage_path, created_at")
        .eq("reservation_id", reservationId)
        .order("created_at", { ascending: true }),
      supabase
        .from("rentals")
        .select("id")
        .eq("reservation_id", reservationId)
        .limit(1)
        .maybeSingle(),
    ]);

  const status = statusResult.data?.[0];
  const identity = identityResult.data;
  const agreement = agreementResult.data;
  const deposit = depositResult.data;
  const rental = rentalResult.data;
  const photos = photosResult.data ?? [];

  const customer =
    reservation.accounts?.full_name || reservation.accounts?.email || t("unknownCustomer");
  const isOpen = reservation.status === "pending" || reservation.status === "confirmed";
  const required = status?.deposit_required_minor ?? 0;
  const money = (minor: number) => formatMinor(minor, reservation.currency, locale);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8">
      <div>
        <Link href="/reservations" className="text-sm text-[var(--color-accent)] underline">
          {t("title")}
        </Link>
        <h1 className="mt-1 text-2xl text-[var(--color-text)]">
          {reservation.vehicles?.model} &middot; {reservation.vehicles?.license_plate}
        </h1>
        <p className="text-sm text-[var(--color-text)]">{customer}</p>
        {reservation.accounts?.email && reservation.accounts.email !== customer && (
          <p className="text-sm text-[var(--color-text-muted)]">{reservation.accounts.email}</p>
        )}
        <p className="tabular mt-1 text-sm text-[var(--color-text-muted)]">
          {new Date(reservation.start_at).toLocaleString(locale)} &rarr;{" "}
          {new Date(reservation.end_at).toLocaleString(locale)} &middot;{" "}
          {money(reservation.total_minor)}
        </p>
        <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
          {t(`status.${reservation.status}`)}
        </p>
      </div>

      {isOpen && (
        <div className="flex flex-wrap gap-2">
          {reservation.status === "pending" && (
            <ActionButton
              action={confirmReservation.bind(null, reservationId)}
              label={t("confirm")}
            />
          )}
          {!rental && (
            <ActionButton
              action={cancelReservationAsStaff.bind(null, reservationId)}
              label={t("cancel")}
              variant="danger"
              confirmText={t("cancelConfirm")}
            />
          )}
          {rental && (
            <Link
              href={`/rentals/${rental.id}`}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)]"
            >
              {t("rental.open")}
            </Link>
          )}
        </div>
      )}

      {status && (
        <p
          className="rounded-md px-3 py-2 text-sm font-medium"
          style={{
            backgroundColor: status.all_ok
              ? "var(--color-status-available-bg)"
              : "var(--color-status-rented-bg)",
            color: status.all_ok ? "var(--color-status-available)" : "var(--color-status-rented)",
          }}
        >
          {status.all_ok ? t("ready") : t("notReady")}
          {status.all_ok && " · "}
          {status.all_ok &&
            (status.in_pickup_window
              ? t("window.open")
              : t("window.opensAt", {
                  time: new Date(
                    new Date(reservation.start_at).getTime() - 2 * 3600_000,
                  ).toLocaleString(locale),
                }))}
        </p>
      )}

      <Card title={t("id.title")} state={<Dot ok={Boolean(status?.identity_ok)} />}>
        {!identity && <p className="text-sm text-[var(--color-text-muted)]">{t("id.none")}</p>}
        {identity?.status === "approved" && (
          <p className="text-sm text-[var(--color-text)]">
            {t("id.approved", { date: identity.license_valid_until ?? "" })}
          </p>
        )}
        {identity?.status === "rejected" && (
          <p className="text-sm text-[var(--color-status-service)]">{t("id.rejected")}</p>
        )}
        {identity?.status === "pending" && (
          <>
            <p className="text-sm text-[var(--color-text)]">{t("id.pending")}</p>
            <IdentityReviewForm action={reviewIdentity.bind(null, reservationId)} />
          </>
        )}
      </Card>

      <Card title={t("agreement.title")} state={<Dot ok={Boolean(agreement)} />}>
        {agreement ? (
          <>
            <p className="text-sm text-[var(--color-text)]">
              {t("agreement.signed", {
                name: agreement.signed_name,
                date: new Date(agreement.signed_at).toLocaleString(locale),
              })}
            </p>
            <details className="text-sm text-[var(--color-text-muted)]">
              <summary className="cursor-pointer">{t("agreement.text")}</summary>
              <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                {agreement.contract_text}
              </pre>
            </details>
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">{t("agreement.unsigned")}</p>
        )}
      </Card>

      <Card title={t("deposit.title")} state={<Dot ok={Boolean(status?.deposit_ok)} />}>
        {required === 0 && !deposit ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t("deposit.none")}</p>
        ) : (
          <>
            <p className="text-sm text-[var(--color-text)]">
              {t(`deposit.${deposit?.status ?? "notRequested"}`, {
                amount: money(deposit?.amount_minor ?? required),
              })}
            </p>
            {deposit?.status === "held" && (
              <p className="text-sm text-[var(--color-text-muted)]">
                {deposit.provider === "stripe" ? t("deposit.viaCard") : t("deposit.viaManual")}
              </p>
            )}
            <div className="flex flex-wrap items-end gap-3">
              {deposit?.status !== "held" &&
                deposit?.status !== "released" &&
                deposit?.status !== "captured" && (
                  <ActionButton
                    action={markDepositReceived.bind(null, reservationId)}
                    label={t("deposit.markReceived")}
                    variant="secondary"
                  />
                )}
              {deposit?.status === "held" && (
                <>
                  <ActionButton
                    action={releaseDeposit.bind(null, reservationId)}
                    label={t("deposit.release")}
                    variant="secondary"
                  />
                  <CaptureForm
                    action={captureDeposit.bind(null, reservationId)}
                    max={deposit.amount_minor}
                  />
                </>
              )}
            </div>
          </>
        )}
      </Card>

      <Card title={t("photos.title")} state={<Dot ok={Boolean(status?.photos_ok)} />}>
        <PhotoGallery supabase={supabase} photos={photos} locale={locale} />
      </Card>

      <p className="text-sm text-[var(--color-text-muted)]">
        {status?.keybox_configured ? t("keybox.set") : t("keybox.missing")}
        {!status?.keybox_configured && (
          <>
            {" "}
            <Link
              href={`/fleet/${reservation.vehicle_id}`}
              className="text-[var(--color-accent)] underline"
            >
              {reservation.vehicles?.model}
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
