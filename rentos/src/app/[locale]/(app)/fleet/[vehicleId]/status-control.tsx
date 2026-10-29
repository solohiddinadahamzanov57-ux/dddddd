"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { VEHICLE_STATUSES, type VehicleStatus } from "@/lib/vehicles/types";

import { changeVehicleStatus, deleteVehicle } from "../actions";

type ActionState = { error?: string };

export function StatusControl({
  vehicleId,
  currentStatus,
}: {
  vehicleId: string;
  currentStatus: VehicleStatus;
}) {
  const t = useTranslations("fleet");
  const tErrors = useTranslations();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    (_prevState, formData) => changeVehicleStatus(vehicleId, formData),
    {},
  );

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="block text-[var(--color-text)]">{t("changeStatus")}</span>
        <select
          name="status"
          defaultValue={currentStatus}
          className="mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
        >
          {VEHICLE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
      </label>
      <input
        name="note"
        placeholder={t("statusNote")}
        className="min-w-32 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
      />
      <button
        type="submit"
        className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)]"
      >
        {pending ? "…" : t("update")}
      </button>
      {state.error && (
        <span className="text-sm text-[var(--color-status-service)]">{tErrors(state.error)}</span>
      )}
    </form>
  );
}

export function DeleteButton({ locale, vehicleId }: { locale: string; vehicleId: string }) {
  const t = useTranslations("fleet");
  const tErrors = useTranslations();
  const [state, action, pending] = useActionState<ActionState, FormData>(
    () => deleteVehicle(locale, vehicleId),
    {},
  );

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(t("deleteConfirm"))) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-[var(--color-status-service)] px-3 py-1.5 text-sm font-medium text-[var(--color-status-service)]"
      >
        {pending ? "…" : t("deleteVehicle")}
      </button>
      {state.error && (
        <p className="mt-1 text-sm text-[var(--color-status-service)]">{tErrors(state.error)}</p>
      )}
    </form>
  );
}
