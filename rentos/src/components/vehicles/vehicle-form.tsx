"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { Field, FormError, SubmitButton } from "@/components/form/field";
import {
  FUEL_TYPES,
  LEVEL_SOURCES,
  VEHICLE_TYPES,
  subtypesFor,
  type VehicleType,
} from "@/lib/vehicles/types";

const selectClass =
  "mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]";

export interface VehicleFormDefaults {
  model?: string;
  type?: VehicleType;
  subtype?: string;
  color?: string;
  licensePlate?: string;
  parkingStall?: string;
  odometer?: number;
  fuelType?: string;
  fuelOrChargeLevel?: number;
  levelSource?: string;
}

type ActionState = { error?: string; fieldErrors?: Record<string, string> };

export function VehicleForm({
  action,
  defaults,
  submitLabel,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: VehicleFormDefaults;
  submitLabel: string;
}) {
  const t = useTranslations("fleet");
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [type, setType] = useState<VehicleType>(defaults?.type ?? "car");
  const subtypes = subtypesFor(type);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label={t("form.model")} name="model" defaultValue={defaults?.model} />
      {state.fieldErrors?.model && <FormError message={state.fieldErrors.model} />}

      <div className="grid grid-cols-2 gap-4">
        <label className="block text-sm">
          <span className="text-[var(--color-text)]">{t("form.type")}</span>
          <select
            name="type"
            className={selectClass}
            value={type}
            onChange={(e) => setType(e.target.value as VehicleType)}
          >
            {VEHICLE_TYPES.map((vt) => (
              <option key={vt} value={vt}>
                {t(`vehicleType.${vt}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--color-text)]">{t("form.subtype")}</span>
          <select
            name="subtype"
            className={selectClass}
            defaultValue={defaults?.subtype ?? subtypes[0]}
          >
            {subtypes.map((s) => (
              <option key={s} value={s}>
                {t(`subtype.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.fieldErrors?.subtype && <FormError message={state.fieldErrors.subtype} />}

      <div className="grid grid-cols-2 gap-4">
        <Field
          label={t("form.licensePlate")}
          name="licensePlate"
          defaultValue={defaults?.licensePlate}
        />
        <Field
          label={t("form.color")}
          name="color"
          required={false}
          defaultValue={defaults?.color}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field
          label={t("form.parkingStall")}
          name="parkingStall"
          required={false}
          defaultValue={defaults?.parkingStall}
        />
        <Field
          label={t("form.odometer")}
          name="odometer"
          type="number"
          defaultValue={defaults?.odometer ? String(defaults.odometer) : "0"}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <label className="block text-sm">
          <span className="text-[var(--color-text)]">{t("form.fuelType")}</span>
          <select
            name="fuelType"
            className={selectClass}
            defaultValue={defaults?.fuelType ?? "gasoline"}
          >
            {FUEL_TYPES.map((f) => (
              <option key={f} value={f}>
                {t(`fuel.${f}`)}
              </option>
            ))}
          </select>
        </label>
        <Field
          label={t("form.level")}
          name="fuelOrChargeLevel"
          type="number"
          defaultValue={
            defaults?.fuelOrChargeLevel !== undefined ? String(defaults.fuelOrChargeLevel) : "100"
          }
        />
        <label className="block text-sm">
          <span className="text-[var(--color-text)]">{t("form.levelSource")}</span>
          <select
            name="levelSource"
            className={selectClass}
            defaultValue={defaults?.levelSource ?? "manual"}
          >
            {LEVEL_SOURCES.map((s) => (
              <option key={s} value={s}>
                {t(`levelSource.${s}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {state.error && <FormError message={tErrors(state.error)} />}
      <SubmitButton>{pending ? "…" : submitLabel}</SubmitButton>
    </form>
  );
}
