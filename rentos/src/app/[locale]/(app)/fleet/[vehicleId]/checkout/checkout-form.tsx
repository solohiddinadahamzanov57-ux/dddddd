"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/form/field";
import type { ExtraItem } from "@/lib/billing/schemas";

type ActionState = { error?: string };
type Member = { id: string; full_name: string };

const inputClass =
  "mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]";

const EXTRA_TYPES = ["equipment", "service", "insurance", "additional_driver"] as const;

export function CheckoutForm({
  action,
  members,
}: {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  members: Member[];
}) {
  const t = useTranslations("rentals");
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  const [useExisting, setUseExisting] = useState(members.length > 0);
  const [extras, setExtras] = useState<ExtraItem[]>([]);
  const [draft, setDraft] = useState<ExtraItem>({ itemType: "equipment", label: "", costMinor: 0 });

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-[var(--color-text)]">{t("customer")}</legend>
        {members.length > 0 && (
          <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input
              type="radio"
              checked={useExisting}
              onChange={() => setUseExisting(true)}
              name="customerMode"
            />
            {t("existingCustomer")}
          </label>
        )}
        {useExisting && members.length > 0 && (
          <select name="memberAccountId" className={inputClass} required>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
          <input
            type="radio"
            checked={!useExisting}
            onChange={() => setUseExisting(false)}
            name="customerMode"
          />
          {t("newCustomer")}
        </label>
        {!useExisting && (
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="text-[var(--color-text)]">{t("customerName")}</span>
              <input name="newMemberName" className={inputClass} required={!useExisting} />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-text)]">{t("customerEmail")}</span>
              <input
                name="newMemberEmail"
                type="email"
                className={inputClass}
                required={!useExisting}
              />
            </label>
            <label className="col-span-2 block text-sm">
              <span className="text-[var(--color-text)]">{t("customerPhone")}</span>
              <input name="newMemberPhone" className={inputClass} />
            </label>
          </div>
        )}
      </fieldset>

      <label className="block text-sm">
        <span className="text-[var(--color-text)]">{t("expectedReturn")}</span>
        <input name="expectedReturnAt" type="datetime-local" className={inputClass} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-[var(--color-text)]">{t("extras")}</legend>
        {extras.length > 0 && (
          <ul className="flex flex-col gap-1">
            {extras.map((e, i) => (
              <li
                key={i}
                className="flex items-center justify-between text-sm text-[var(--color-text)]"
              >
                <span>
                  {t(`extraType.${e.itemType}`)} &middot; {e.label} &middot;{" "}
                  {(e.costMinor / 100).toFixed(2)}
                </span>
                <button
                  type="button"
                  onClick={() => setExtras(extras.filter((_, j) => j !== i))}
                  className="text-xs text-[var(--color-status-service)] underline"
                >
                  {t("remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <select
            className={inputClass}
            value={draft.itemType}
            onChange={(e) =>
              setDraft({ ...draft, itemType: e.target.value as ExtraItem["itemType"] })
            }
          >
            {EXTRA_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`extraType.${type}`)}
              </option>
            ))}
          </select>
          <input
            placeholder={t("extraLabelPlaceholder")}
            className={inputClass}
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="0.00"
            className={`${inputClass} w-28`}
            value={draft.costMinor === 0 ? "" : draft.costMinor / 100}
            onChange={(e) =>
              setDraft({ ...draft, costMinor: Math.round(Number(e.target.value || 0) * 100) })
            }
          />
          <button
            type="button"
            onClick={() => {
              if (!draft.label.trim()) return;
              setExtras([...extras, draft]);
              setDraft({ itemType: "equipment", label: "", costMinor: 0 });
            }}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)]"
          >
            {t("addExtra")}
          </button>
        </div>
      </fieldset>
      <input type="hidden" name="extrasJson" value={JSON.stringify(extras)} />

      {state.error && <FormError message={tErrors(state.error)} />}
      <SubmitButton>{pending ? "…" : t("startRental")}</SubmitButton>
    </form>
  );
}
