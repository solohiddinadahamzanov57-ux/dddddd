"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormError } from "@/components/form/field";

import type { StaffState } from "./actions";

type Action = (prev: StaffState, formData: FormData) => Promise<StaffState>;

const PRIMARY =
  "rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)] disabled:opacity-60";
const SECONDARY =
  "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] disabled:opacity-60";
const DANGER =
  "rounded-md border border-[var(--color-status-service)] px-3 py-1.5 text-sm font-medium text-[var(--color-status-service)] disabled:opacity-60";

export function ActionButton({
  action,
  label,
  variant = "primary",
  confirmText,
}: {
  action: Action;
  label: string;
  variant?: "primary" | "secondary" | "danger";
  confirmText?: string;
}) {
  const tAll = useTranslations();
  const [state, formAction, pending] = useActionState<StaffState, FormData>(action, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
      className="flex flex-col gap-2"
    >
      <button
        type="submit"
        disabled={pending}
        className={variant === "primary" ? PRIMARY : variant === "danger" ? DANGER : SECONDARY}
      >
        {pending ? "…" : label}
      </button>
      {state.error && <FormError message={tAll(state.error)} />}
    </form>
  );
}

export function IdentityReviewForm({ action }: { action: Action }) {
  const t = useTranslations("reservations.id");
  const tAll = useTranslations();
  const [state, formAction, pending] = useActionState<StaffState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-[var(--color-text-muted)]">{t("help")}</p>
      <label className="block text-sm">
        <span className="text-[var(--color-text)]">{t("licenceValidUntil")}</span>
        <input
          type="date"
          name="licenseValidUntil"
          className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]"
        />
      </label>
      <label className="flex items-start gap-2 text-sm text-[var(--color-text)]">
        <input type="checkbox" name="ageConfirmed" className="mt-1 h-4 w-4" />
        <span>{t("ageConfirmed")}</span>
      </label>
      {state.error && <FormError message={tAll(state.error)} />}
      <div className="flex gap-2">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending}
          className={PRIMARY}
        >
          {t("approve")}
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          disabled={pending}
          formNoValidate
          className={DANGER}
        >
          {t("reject")}
        </button>
      </div>
    </form>
  );
}

export function CaptureForm({ action, max }: { action: Action; max: number }) {
  const t = useTranslations("reservations.deposit");
  const tAll = useTranslations();
  const [state, formAction, pending] = useActionState<StaffState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="block text-sm">
        <span className="text-[var(--color-text)]">{t("captureAmount")}</span>
        <input
          type="number"
          name="amount"
          min="0.01"
          max={max / 100}
          step="0.01"
          required
          className="mt-1 w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]"
        />
      </label>
      <button type="submit" disabled={pending} className={SECONDARY}>
        {pending ? "…" : t("capture")}
      </button>
      {state.error && <FormError message={tAll(state.error)} />}
    </form>
  );
}
