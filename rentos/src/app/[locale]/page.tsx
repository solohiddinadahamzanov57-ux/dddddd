import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <HomeContent />;
}

function HomeContent() {
  const t = useTranslations("auth");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl text-[var(--color-text)]">RentOS</h1>
      <p className="max-w-md text-center text-[var(--color-text-muted)]">
        Fleet management, live rental timers, and revenue tracking for small car rental companies.
      </p>
      <div className="flex gap-3">
        <Link
          href="/sign-up"
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-[var(--color-accent-contrast)]"
        >
          {t("signUpLink")}
        </Link>
        <Link
          href="/sign-in"
          className="rounded-md border border-[var(--color-border)] px-4 py-2 font-medium text-[var(--color-text)]"
        >
          {t("signInLink")}
        </Link>
      </div>
    </main>
  );
}
