"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useActionState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { Field, FormError, SubmitButton } from "@/components/form/field";

import { createCompany, type CreateCompanyState } from "./actions";

const CURRENCIES = ["USD", "EUR", "GBP", "RUB", "AED", "KZT"];

export default function OnboardingPage() {
  const t = useTranslations("onboarding");
  const { locale } = useParams<{ locale: string }>();
  const [state, action, pending] = useActionState<CreateCompanyState, FormData>(
    (prevState, formData) => createCompany(locale, prevState, formData),
    {},
  );

  return (
    <AuthCard title={t("title")} subtitle={t("subtitle")}>
      <form action={action} className="flex flex-col gap-4">
        <Field label={t("companyName")} name="name" placeholder={t("companyNamePlaceholder")} />
        <label className="block text-sm">
          <span className="text-[var(--color-text)]">{t("currency")}</span>
          <select
            name="defaultCurrency"
            defaultValue="USD"
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-text)]"
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
        <Field label={t("timezone")} name="timezone" defaultValue="UTC" />
        <FormError message={state.error} />
        <SubmitButton>{pending ? "…" : t("submit")}</SubmitButton>
      </form>
    </AuthCard>
  );
}
