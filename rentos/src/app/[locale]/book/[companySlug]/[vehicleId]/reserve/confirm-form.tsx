"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormError, SubmitButton } from "@/components/form/field";

import { createReservation, type CreateReservationState } from "./actions";

export function ConfirmForm({
  locale,
  companySlug,
  vehicleId,
  startAt,
  endAt,
}: {
  locale: string;
  companySlug: string;
  vehicleId: string;
  startAt: string;
  endAt: string;
}) {
  const t = useTranslations("booking");
  const tErrors = useTranslations();
  const [state, action, pending] = useActionState<CreateReservationState, FormData>(
    (prevState, formData) => createReservation(locale, companySlug, vehicleId, prevState, formData),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="startAt" value={startAt} />
      <input type="hidden" name="endAt" value={endAt} />
      {state.error && <FormError message={tErrors(state.error)} />}
      <SubmitButton>{pending ? "…" : t("confirmReservation")}</SubmitButton>
    </form>
  );
}
