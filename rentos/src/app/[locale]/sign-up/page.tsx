"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useActionState } from "react";

import { AuthCard } from "@/components/auth/auth-card";
import { Field, FormError, SubmitButton } from "@/components/form/field";
import { Link } from "@/i18n/navigation";

import { signUp, type SignUpState } from "./actions";

export default function SignUpPage() {
  const t = useTranslations("auth");
  const { locale } = useParams<{ locale: string }>();
  const [state, action, pending] = useActionState<SignUpState, FormData>(
    (prevState, formData) => signUp(locale, prevState, formData),
    {},
  );

  if (state.confirmEmail) {
    return (
      <AuthCard title={t("signUpTitle")}>
        <p className="text-sm text-[var(--color-text)]">
          Check your email to confirm your account, then{" "}
          <Link href="/sign-in" className="text-[var(--color-accent)] underline">
            {t("signInLink").toLowerCase()}
          </Link>
          .
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("signUpTitle")}>
      <form action={action} className="flex flex-col gap-4">
        <Field label={t("email")} name="email" type="email" />
        <Field label={t("password")} name="password" type="password" />
        <FormError message={state.error} />
        <SubmitButton>{pending ? "…" : t("signUpSubmit")}</SubmitButton>
      </form>
      <p className="mt-4 text-sm text-[var(--color-text-muted)]">
        {t("signInPrompt")}{" "}
        <Link href="/sign-in" className="text-[var(--color-accent)] underline">
          {t("signInLink")}
        </Link>
      </p>
    </AuthCard>
  );
}
