import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { formatMinor } from "@/lib/billing/money";
import { isStripeConfigured } from "@/lib/stripe/client";
import {
  ALL_ANGLES,
  REQUIRED_ANGLES,
  type ContactlessStatus,
  type PhotoAngle,
} from "@/lib/contactless/types";
import { createClient } from "@/lib/supabase/server";

import {
  AgreementForm,
  DepositButton,
  IdentityRequestButton,
  PhotoCapture,
  UnlockPanel,
} from "./steps";

type StepState = "done" | "todo" | "waiting";

type Labels = { step: (n: number) => string; done: string; todo: string; waiting: string };

function Step({
  n,
  title,
  state,
  labels,
  children,
}: {
  n: number;
  title: string;
  state: StepState;
  labels: Labels;
  children: ReactNode;
}) {
  const badge =
    state === "done"
      ? {
          text: labels.done,
          bg: "var(--color-status-available-bg)",
          fg: "var(--color-status-available)",
        }
      : state === "waiting"
        ? {
            text: labels.waiting,
            bg: "var(--color-status-rented-bg)",
            fg: "var(--color-status-rented)",
          }
        : { text: labels.todo, bg: "var(--color-surface)", fg: "var(--color-text-muted)" };
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-[var(--color-text-muted)]">{labels.step(n)}</p>
          <h3 className="text-base text-[var(--color-text)]">{title}</h3>
        </div>
        <span
          className="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: badge.bg, color: badge.fg }}
        >
          {badge.text}
        </span>
      </div>
      {children}
    </li>
  );
}

export async function ContactlessSection({
  locale,
  companySlug,
  reservation,
}: {
  locale: string;
  companySlug: string;
  reservation: { id: string; company_id: string; status: string; start_at: string };
}) {
  const t = await getTranslations("contactless");
  const labels: Labels = {
    step: (n) => t("step", { n }),
    done: t("done"),
    todo: t("todo"),
    waiting: t("waitingCompany"),
  };
  const supabase = await createClient();

  const [statusResult, identityResult, agreementResult, depositResult, photosResult, rentalResult] =
    await Promise.all([
      supabase.rpc("contactless_status", { p_reservation_id: reservation.id }),
      supabase
        .from("identity_verifications")
        .select("status")
        .eq("reservation_id", reservation.id)
        .maybeSingle(),
      supabase
        .from("rental_agreements")
        .select("signed_name, signed_at, contract_text")
        .eq("reservation_id", reservation.id)
        .maybeSingle(),
      supabase
        .from("reservation_deposits")
        .select("status, amount_minor, currency")
        .eq("reservation_id", reservation.id)
        .maybeSingle(),
      supabase.from("handover_photos").select("angle, phase").eq("reservation_id", reservation.id),
      supabase
        .from("rentals")
        .select("id, status")
        .eq("reservation_id", reservation.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const status: ContactlessStatus | undefined = statusResult.data?.[0];
  if (!status) return null;

  const identity = identityResult.data;
  const agreement = agreementResult.data;
  const deposit = depositResult.data;
  const rental = rentalResult.data;
  const confirmed = status.reservation_confirmed;
  const photos = photosResult.data ?? [];
  const pickupAngles = photos.filter((p) => p.phase === "pickup").map((p) => p.angle as PhotoAngle);
  const returnAngles = photos.filter((p) => p.phase === "return").map((p) => p.angle as PhotoAngle);

  let contractText = agreement?.contract_text ?? "";
  if (!agreement) {
    const rendered = await supabase.rpc("render_rental_agreement", {
      p_reservation_id: reservation.id,
      p_locale: locale,
    });
    contractText = rendered.data?.[0]?.body ?? "";
  }

  const cardHolds = isStripeConfigured();
  const opensAt = new Date(new Date(reservation.start_at).getTime() - 2 * 60 * 60 * 1000);

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl text-[var(--color-text)]">{t("title")}</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{t("intro")}</p>
      </div>
      {!confirmed && reservation.status === "pending" && (
        <p className="rounded-md bg-[var(--color-status-rented-bg)] px-3 py-2 text-sm text-[var(--color-status-rented)]">
          {t("waitingConfirm")}
        </p>
      )}

      <ol className="flex flex-col gap-3">
        <Step
          n={1}
          labels={labels}
          title={t("id.title")}
          state={status.identity_ok ? "done" : identity?.status === "pending" ? "waiting" : "todo"}
        >
          <p className="text-sm text-[var(--color-text-muted)]">{t("id.description")}</p>
          {status.identity_ok ? (
            <p className="text-sm text-[var(--color-text)]">{t("id.approved")}</p>
          ) : identity?.status === "pending" ? (
            <p className="text-sm text-[var(--color-text)]">{t("id.requested")}</p>
          ) : identity?.status === "rejected" ? (
            <p className="text-sm text-[var(--color-status-service)]">{t("id.rejected")}</p>
          ) : identity?.status === "approved" ? (
            <p className="text-sm text-[var(--color-status-service)]">{t("id.licenceShort")}</p>
          ) : (
            <IdentityRequestButton reservationId={reservation.id} />
          )}
        </Step>

        <Step
          n={2}
          labels={labels}
          title={t("agreement.title")}
          state={status.agreement_signed ? "done" : "todo"}
        >
          {agreement ? (
            <>
              <p className="text-sm text-[var(--color-text)]">
                {t("agreement.signedBy", {
                  name: agreement.signed_name,
                  date: new Date(agreement.signed_at).toLocaleString(locale),
                })}
              </p>
              <details className="text-sm text-[var(--color-text-muted)]">
                <summary className="cursor-pointer">{t("agreement.contract")}</summary>
                <pre className="mt-2 max-h-64 overflow-auto text-xs whitespace-pre-wrap">
                  {agreement.contract_text}
                </pre>
              </details>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-muted)]">{t("agreement.description")}</p>
              <AgreementForm
                locale={locale}
                reservationId={reservation.id}
                contractText={contractText}
              />
            </>
          )}
        </Step>

        <Step
          n={3}
          labels={labels}
          title={t("deposit.title")}
          state={
            status.deposit_ok
              ? "done"
              : deposit?.status === "pending" && !cardHolds
                ? "waiting"
                : "todo"
          }
        >
          {status.deposit_required_minor === 0 ? (
            <p className="text-sm text-[var(--color-text)]">{t("deposit.none")}</p>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-muted)]">
                {t("deposit.amount", {
                  amount: formatMinor(
                    status.deposit_required_minor,
                    deposit?.currency ?? "USD",
                    locale,
                  ),
                })}
              </p>
              {status.deposit_ok ? (
                <p className="text-sm text-[var(--color-text)]">{t("deposit.held")}</p>
              ) : deposit?.status === "pending" && !cardHolds ? (
                <p className="text-sm text-[var(--color-text)]">{t("deposit.waiting")}</p>
              ) : (
                <DepositButton
                  locale={locale}
                  companySlug={companySlug}
                  reservationId={reservation.id}
                  cardHolds={cardHolds}
                />
              )}
            </>
          )}
        </Step>

        <Step
          n={4}
          labels={labels}
          title={t("photos.title")}
          state={status.photos_ok ? "done" : !confirmed ? "waiting" : "todo"}
        >
          <p className="text-sm text-[var(--color-text-muted)]">{t("photos.description")}</p>
          <PhotoCapture
            companyId={reservation.company_id}
            reservationId={reservation.id}
            phase="pickup"
            angles={ALL_ANGLES}
            captured={pickupAngles}
            required={REQUIRED_ANGLES.length}
            disabled={!confirmed || Boolean(rental)}
          />
        </Step>

        <Step
          n={5}
          labels={labels}
          title={t("unlock.title")}
          state={rental ? "done" : status.can_unlock ? "todo" : "waiting"}
        >
          {rental?.status === "completed" ? (
            <p className="text-sm text-[var(--color-text)]">{t("unlock.finished")}</p>
          ) : rental ? (
            <UnlockPanel reservationId={reservation.id} rentalActive />
          ) : status.can_unlock ? (
            <UnlockPanel reservationId={reservation.id} rentalActive={false} />
          ) : status.all_ok && !status.in_pickup_window ? (
            <p className="text-sm text-[var(--color-text-muted)]">
              {t("unlock.opensAt", { time: opensAt.toLocaleString(locale) })}
            </p>
          ) : !status.keybox_configured ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("unlock.noKeybox")}</p>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">{t("unlock.locked")}</p>
          )}
        </Step>
      </ol>

      {rental?.status === "active" && (
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
          <h3 className="text-base text-[var(--color-text)]">{t("returnPhotos.title")}</h3>
          <p className="text-sm text-[var(--color-text-muted)]">{t("returnPhotos.description")}</p>
          <PhotoCapture
            companyId={reservation.company_id}
            reservationId={reservation.id}
            phase="return"
            angles={ALL_ANGLES}
            captured={returnAngles}
            required={REQUIRED_ANGLES.length}
            disabled={false}
          />
        </div>
      )}
    </section>
  );
}
