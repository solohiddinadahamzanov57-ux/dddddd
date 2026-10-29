"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/form/field";

import { completeRental } from "../actions";

type ActionState = { error?: string };

export function ReturnForm({
  locale,
  rentalId,
  odometerStart,
}: {
  locale: string;
  rentalId: string;
  odometerStart: number;
}) {
  const t = useTranslations("rentals");
  const tErrors = useTranslations();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    (prevState, formData) => completeRental(locale, rentalId, prevState, formData),
    {},
  );

  return (
    <form action={action} className="flex flex-col gap-3">
      <Field
        label={t("odometerEnd")}
        name="odometerEnd"
        type="number"
        defaultValue={String(odometerStart)}
      />
      {state.error && <FormError message={tErrors(state.error)} />}
      <SubmitButton>{pending ? "…" : t("returnVehicle")}</SubmitButton>
    </form>
  );
}
