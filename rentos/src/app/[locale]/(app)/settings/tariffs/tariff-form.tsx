"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Field, FormError, SubmitButton } from "@/components/form/field";
import { VEHICLE_TYPES } from "@/lib/vehicles/types";

type ActionState = { error?: string };

export interface TariffFormDefaults {
  vehicleType?: string;
  currency?: string;
  hourlyRateMinor?: number;
  dailyRateMinor?: number;
  weeklyRateMinor?: number;
  gracePeriodMinutes?: number;
  lateFeePerHourMinor?: number;
  depositMinor?: number;
}

const toDisplay = (minor?: number) => (minor !== undefined ? String(minor / 100) : "");

export function TariffForm({
  action,
  defaults,
  allowTypeSelect,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  defaults?: TariffFormDefaults;
  allowTypeSelect?: boolean;
}) {
  const t = useTranslations("tariffs");
  const tFleet = useTranslations("fleet");
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-4"
    >
      {allowTypeSelect ? (
        <label className="block text-sm">
          <span className="text-[var(--color-text)]">{t("vehicleType")}</span>
          <select
            name="vehicleType"
            defaultValue={defaults?.vehicleType ?? ""}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            <option value="">{t("allTypesDefault")}</option>
            {VEHICLE_TYPES.map((vt) => (
              <option key={vt} value={vt}>
                {tFleet(`vehicleType.${vt}`)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <input type="hidden" name="vehicleType" value={defaults?.vehicleType ?? ""} />
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("currency")} name="currency" defaultValue={defaults?.currency ?? "USD"} />
        <Field
          label={t("gracePeriodMinutes")}
          name="gracePeriodMinutes"
          type="number"
          defaultValue={String(defaults?.gracePeriodMinutes ?? 15)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("hourlyRate")}
          name="hourlyRateMinorDisplay"
          type="number"
          defaultValue={toDisplay(defaults?.hourlyRateMinor)}
        />
        <Field
          label={t("dailyRate")}
          name="dailyRateMinorDisplay"
          type="number"
          defaultValue={toDisplay(defaults?.dailyRateMinor)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={t("weeklyRate")}
          name="weeklyRateMinorDisplay"
          type="number"
          defaultValue={toDisplay(defaults?.weeklyRateMinor)}
        />
        <Field
          label={t("lateFeePerHour")}
          name="lateFeePerHourMinorDisplay"
          type="number"
          defaultValue={toDisplay(defaults?.lateFeePerHourMinor)}
        />
      </div>

      <Field
        label={t("depositAmount")}
        name="depositMinorDisplay"
        type="number"
        defaultValue={toDisplay(defaults?.depositMinor ?? 0)}
      />

      {/* Hidden minor-unit fields the visible dollar/euro inputs above keep in sync client-side. */}
      <MinorSync displayName="hourlyRateMinorDisplay" hiddenName="hourlyRateMinor" />
      <MinorSync displayName="dailyRateMinorDisplay" hiddenName="dailyRateMinor" />
      <MinorSync displayName="weeklyRateMinorDisplay" hiddenName="weeklyRateMinor" />
      <MinorSync displayName="lateFeePerHourMinorDisplay" hiddenName="lateFeePerHourMinor" />
      <MinorSync displayName="depositMinorDisplay" hiddenName="depositMinor" />

      {state.error && <FormError message={tErrors(state.error)} />}
      <SubmitButton>{pending ? "…" : t("save")}</SubmitButton>
    </form>
  );
}

/** Keeps a hidden minor-units input in sync with its paired major-units display input, without a controlled-input round trip. */
function MinorSync({ displayName, hiddenName }: { displayName: string; hiddenName: string }) {
  return (
    <input
      type="hidden"
      name={hiddenName}
      ref={(hiddenEl) => {
        if (!hiddenEl) return;
        const displayEl = hiddenEl.form?.elements.namedItem(displayName) as HTMLInputElement | null;
        if (!displayEl) return;
        const sync = () => {
          hiddenEl.value = String(Math.round(Number(displayEl.value || 0) * 100));
        };
        sync();
        displayEl.addEventListener("input", sync);
        return () => displayEl.removeEventListener("input", sync);
      }}
    />
  );
}
