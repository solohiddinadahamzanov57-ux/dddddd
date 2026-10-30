import { Link } from "@/i18n/navigation";

export function BookingHeader({
  companyName,
  companySlug,
}: {
  companyName: string;
  companySlug: string;
}) {
  return (
    <header className="border-b border-[var(--color-border)] px-4 py-3">
      <Link href={`/book/${companySlug}`} className="text-sm font-medium text-[var(--color-text)]">
        {companyName}
      </Link>
    </header>
  );
}
