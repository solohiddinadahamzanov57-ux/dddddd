"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { FormError } from "@/components/form/field";

type ActionState = { error?: string };

export function KeyboxForm({
  action,
  currentCode,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  currentCode?: string;
}) {
  const t = useTranslations("fleet.keybox");
  const tAll = useTranslations();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <p className="text-sm text-[var(--color-text-muted)]">{t("description")}</p>
      <label className="block text-sm">
        <span className="text-[var(--color-text)]">{t("codeLabel")}</span>
        <input
          name="code"
          defaultValue={currentCode}
          maxLength={32}
          autoComplete="off"
          className="tabular mt-1 w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]"
        />
      </label>
      {state.error && <FormError message={tAll(state.error)} />}
      <div className="flex gap-2">
        <button
          type="submit"
          name="intent"
          value="save"
          disabled={pending}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-contrast)] disabled:opacity-60"
        >
          {pending ? "…" : t("save")}
        </button>
        {currentCode && (
          <button
            type="submit"
            name="intent"
            value="clear"
            formNoValidate
            disabled={pending}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)] disabled:opacity-60"
          >
            {t("clear")}
          </button>
        )}
      </div>
    </form>
  );
}
