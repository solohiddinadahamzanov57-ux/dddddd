"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useActionState, useMemo, useState } from "react";

import { FormError } from "@/components/form/field";
import { downscaleToJpeg } from "@/lib/contactless/image";
import { photoStoragePath, type PhotoAngle, type PhotoPhase } from "@/lib/contactless/types";
import { createClient } from "@/lib/supabase/client";

import {
  recordHandoverPhoto,
  requestIdentityCheck,
  signAgreement,
  startDepositHold,
  unlockVehicle,
  type StepState,
  type UnlockState,
} from "./actions";

const BUTTON =
  "rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-contrast)] disabled:opacity-60";

export function IdentityRequestButton({ reservationId }: { reservationId: string }) {
  const t = useTranslations("contactless.id");
  const tAll = useTranslations();
  const [state, action, pending] = useActionState<StepState, FormData>(
    requestIdentityCheck.bind(null, reservationId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "…" : t("request")}
      </button>
      {state.error && <FormError message={tAll(state.error)} />}
    </form>
  );
}

export function AgreementForm({
  locale,
  reservationId,
  contractText,
}: {
  locale: string;
  reservationId: string;
  contractText: string;
}) {
  const t = useTranslations("contactless.agreement");
  const tAll = useTranslations();
  const [state, action, pending] = useActionState<StepState, FormData>(
    signAgreement.bind(null, locale, reservationId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      <pre
        tabIndex={0}
        aria-label={t("contract")}
        className="max-h-64 overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs leading-relaxed whitespace-pre-wrap text-[var(--color-text)]"
      >
        {contractText}
      </pre>
      <label className="block text-sm">
        <span className="text-[var(--color-text)]">{t("nameLabel")}</span>
        <input
          name="signedName"
          required
          minLength={2}
          maxLength={200}
          autoComplete="name"
          className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)] outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      {/* Unchecked by default; the server refuses a signature without it. */}
      <label className="flex items-start gap-2 text-sm text-[var(--color-text)]">
        <input type="checkbox" name="agree" required className="mt-1 h-4 w-4" />
        <span>{t("agree")}</span>
      </label>
      {state.error && <FormError message={tAll(state.error)} />}
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "…" : t("sign")}
      </button>
    </form>
  );
}

export function DepositButton({
  locale,
  companySlug,
  reservationId,
  cardHolds,
}: {
  locale: string;
  companySlug: string;
  reservationId: string;
  cardHolds: boolean;
}) {
  const t = useTranslations("contactless.deposit");
  const tAll = useTranslations();
  const [state, action, pending] = useActionState<StepState, FormData>(
    startDepositHold.bind(null, locale, companySlug, reservationId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-2">
      <button type="submit" disabled={pending} className={BUTTON}>
        {pending ? "…" : cardHolds ? t("pay") : t("notify")}
      </button>
      {state.notice && (
        <p className="text-sm text-[var(--color-text-muted)]">{tAll(state.notice)}</p>
      )}
      {state.error && <FormError message={tAll(state.error)} />}
    </form>
  );
}

export function PhotoCapture({
  companyId,
  reservationId,
  phase,
  angles,
  captured,
  required,
  disabled,
}: {
  companyId: string;
  reservationId: string;
  phase: PhotoPhase;
  angles: readonly PhotoAngle[];
  captured: readonly PhotoAngle[];
  required: number;
  disabled: boolean;
}) {
  const t = useTranslations("contactless.photos");
  const tAll = useTranslations();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState<PhotoAngle | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(angle: PhotoAngle, file: File) {
    setBusy(angle);
    setError(null);
    try {
      const blob = await downscaleToJpeg(file);
      const path = photoStoragePath(companyId, reservationId, phase, crypto.randomUUID());
      const { error: uploadError } = await supabase.storage
        .from("handover-photos")
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw uploadError;
      const result = await recordHandoverPhoto({ reservationId, phase, angle, path });
      if (result.error) throw new Error(result.error);
      router.refresh();
    } catch (cause) {
      console.error("photo upload failed:", cause);
      setError("errors.photoUploadFailed");
    } finally {
      setBusy(null);
    }
  }

  const doneCount = angles.filter((a) => a !== "interior" && captured.includes(a)).length;

  return (
    <div className="flex flex-col gap-3">
      <p className="tabular text-sm text-[var(--color-text-muted)]">
        {t("count", { done: doneCount, total: required })}
      </p>
      <ul className="flex flex-col gap-2">
        {angles.map((angle) => {
          const has = captured.includes(angle);
          const isBusy = busy === angle;
          return (
            <li
              key={angle}
              className="flex items-center justify-between gap-3 rounded-md border border-[var(--color-border)] px-3 py-2"
            >
              <span className="text-sm text-[var(--color-text)]">{t(`angle.${angle}`)}</span>
              <label
                className={`cursor-pointer rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] ${
                  disabled || busy ? "pointer-events-none opacity-50" : ""
                }`}
              >
                {isBusy ? t("uploading") : has ? t("retake") : t("take")}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  disabled={disabled || busy !== null}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void upload(angle, file);
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>
      {error && <FormError message={tAll(error)} />}
    </div>
  );
}

export function UnlockPanel({
  reservationId,
  rentalActive,
}: {
  reservationId: string;
  rentalActive: boolean;
}) {
  const t = useTranslations("contactless.unlock");
  const tAll = useTranslations();
  const [state, action, pending] = useActionState<UnlockState, FormData>(
    unlockVehicle.bind(null, reservationId),
    {},
  );
  return (
    <form action={action} className="flex flex-col gap-3">
      {state.code ? (
        <div className="rounded-md bg-[var(--color-status-available-bg)] p-4">
          <p className="text-xs text-[var(--color-status-available)]">{t("code")}</p>
          <p className="tabular text-3xl font-semibold tracking-widest text-[var(--color-status-available)]">
            {state.code}
          </p>
          <p className="mt-2 text-sm text-[var(--color-text)]">{t("started")}</p>
        </div>
      ) : (
        <button type="submit" disabled={pending} className={BUTTON}>
          {pending ? "…" : rentalActive ? t("show") : t("unlock")}
        </button>
      )}
      {state.error && <FormError message={tAll(state.error)} />}
    </form>
  );
}
