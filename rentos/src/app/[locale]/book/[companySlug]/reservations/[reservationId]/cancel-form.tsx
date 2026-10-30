"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormError } from "@/components/form/field";

import { cancelReservation, type CancelState } from "./actions";

export function CancelForm({
  companySlug,
  reservationId,
}: {
  companySlug: string;
  reservationId: string;
}) {
  const t = useTranslations("booking");
  const tErrors = useTranslations();
  const [state, action, pending] = useActionState<CancelState, FormData>(
    (prevState, formData) => cancelReservation(companySlug, reservationId, prevState, formData),
    {},
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t("cancelConfirm"))) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-[var(--color-status-service)] px-3 py-1.5 text-sm font-medium text-[var(--color-status-service)]"
      >
        {pending ? "…" : t("cancelReservation")}
      </button>
      {state.error && <FormError message={tErrors(state.error)} />}
    </form>
  );
}
