import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

const NAV_LINKS = [
  { href: "/fleet", key: "fleet" },
  { href: "/reservations", key: "reservations" },
  { href: "/rentals", key: "rentals" },
  { href: "/reports", key: "reports" },
  { href: "/settings/tariffs", key: "settings" },
] as const;

export function AppHeader({
  companyName,
  bookingSlug,
  signOutAction,
}: {
  companyName: string;
  bookingSlug: string;
  signOutAction: () => Promise<void>;
}) {
  const t = useTranslations("auth");
  const tNav = useTranslations("nav");

  return (
    <header className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] px-4 py-3">
      <div className="flex items-center gap-6">
        <span className="text-sm font-medium text-[var(--color-text)]">{companyName}</span>
        <nav className="flex items-center gap-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              {tNav(link.key)}
            </Link>
          ))}
          {bookingSlug && (
            <Link
              href={`/book/${bookingSlug}`}
              className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              {tNav("booking")}
            </Link>
          )}
        </nav>
      </div>
      <form action={signOutAction}>
        <button type="submit" className="text-sm text-[var(--color-text-muted)] underline">
          {t("signOut")}
        </button>
      </form>
    </header>
  );
}
