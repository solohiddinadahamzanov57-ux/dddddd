import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

export function AppHeader({
  companyName,
  signOutAction,
}: {
  companyName: string;
  signOutAction: () => Promise<void>;
}) {
  const t = useTranslations("auth");

  return (
    <header className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
      <Link href="/fleet" className="text-sm font-medium text-[var(--color-text)]">
        {companyName}
      </Link>
      <form action={signOutAction}>
        <button type="submit" className="text-sm text-[var(--color-text-muted)] underline">
          {t("signOut")}
        </button>
      </form>
    </header>
  );
}
