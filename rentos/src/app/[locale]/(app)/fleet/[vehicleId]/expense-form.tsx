"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

const EXPENSE_CATEGORIES = ["repair", "insurance", "fuel", "wash", "fine"] as const;

type ActionState = { error?: string };

export function ExpenseForm({ action }: { action: (formData: FormData) => Promise<ActionState> }) {
  const t = useTranslations("fleet");
  const tErrors = useTranslations();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    (_prevState, formData) => action(formData),
    {},
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <label className="text-sm">
        <span className="block text-[var(--color-text)]">{t("expenseCategory")}</span>
        <select
          name="category"
          className="mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
        >
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`expenseCategoryLabel.${c}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        <span className="block text-[var(--color-text)]">{t("expenseAmount")}</span>
        <input
          name="amountMinorDisplay"
          type="number"
          min={0}
          step="0.01"
          className="mt-1 w-24 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
          onChange={(e) => {
            const hidden = e.currentTarget.form?.elements.namedItem(
              "amountMinor",
            ) as HTMLInputElement | null;
            if (hidden) hidden.value = String(Math.round(Number(e.currentTarget.value || 0) * 100));
          }}
        />
        <input type="hidden" name="amountMinor" />
      </label>
      <label className="text-sm">
        <span className="block text-[var(--color-text)]">{t("expenseDate")}</span>
        <input
          name="occurredOn"
          type="date"
          defaultValue={new Date().toISOString().slice(0, 10)}
          className="mt-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
        />
      </label>
      <input
        name="notes"
        placeholder={t("expenseNotes")}
        className="min-w-28 flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
      />
      <button
        type="submit"
        className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)]"
      >
        {pending ? "…" : t("addExpense")}
      </button>
      {state.error && (
        <span className="text-sm text-[var(--color-status-service)]">{tErrors(state.error)}</span>
      )}
    </form>
  );
}
