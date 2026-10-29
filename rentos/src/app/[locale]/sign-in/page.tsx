"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useActionState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { Field, FormError, SubmitButton } from "@/components/form/field";
import { Link } from "@/i18n/navigation";

import { signIn, type SignInState } from "./actions";

export default function SignInPage() {
  const t = useTranslations("auth");
  const tErrors = useTranslations();
  const { locale } = useParams<{ locale: string }>();
  const [state, action, pending] = useActionState<SignInState, FormData>(
    (prevState, formData) => signIn(locale, prevState, formData),
    {},
  );

  return (
    <AuthCard title={t("signInTitle")}>
      <form action={action} className="flex flex-col gap-4">
        <Field label={t("email")} name="email" type="email" />
        <Field label={t("password")} name="password" type="password" />
        <FormError message={state.error ? tErrors(state.error) : undefined} />
        <SubmitButton>{pending ? "…" : t("signInSubmit")}</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-[var(--color-text-muted)]">
        {t("signUpPrompt")}{" "}
        <Link href="/sign-up" className="text-[var(--color-accent)] underline">
          {t("signUpLink")}
        </Link>
      </p>
    </AuthCard>
  );
}
