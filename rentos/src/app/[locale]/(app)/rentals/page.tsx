import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { formatMinor } from "@/lib/billing/money";
import { createClient } from "@/lib/supabase/server";

export default async function RentalsPage({ params }: PageProps<"/[locale]/rentals">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("rentals");

  const supabase = await createClient();
  const { data: rentals } = await supabase
    .from("rentals")
    .select(
      "id, status, started_at, ended_at, total_minor, currency, vehicles(model, license_plate), accounts!rentals_member_account_id_fkey(full_name, email)",
    )
    .order("started_at", { ascending: false })
    .limit(50);

  const active = (rentals ?? []).filter((r) => r.status === "active");
  const completed = (rentals ?? []).filter((r) => r.status === "completed");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <h1 className="text-2xl text-[var(--color-text)]">{t("title")}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-[var(--color-text)]">{t("active")}</h2>
        {active.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">{t("noActive")}</p>
        )}
        <ul className="flex flex-col gap-2">
          {active.map((r) => (
            <li key={r.id}>
              <Link
                href={`/rentals/${r.id}`}
                className="flex items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3 text-sm"
              >
                <span className="text-[var(--color-text)]">
                  {r.vehicles?.model} &middot; {r.accounts?.full_name || r.accounts?.email}
                </span>
                <span className="tabular text-[var(--color-text-muted)]">
                  {new Date(r.started_at).toLocaleString(locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg text-[var(--color-text)]">{t("recent")}</h2>
        {completed.length === 0 && (
          <p className="text-sm text-[var(--color-text-muted)]">{t("noRecent")}</p>
        )}
        <ul className="flex flex-col gap-2">
          {completed.map((r) => (
            <li key={r.id}>
              <Link
                href={`/rentals/${r.id}`}
                className="flex items-center justify-between rounded-md border border-[var(--color-border)] p-3 text-sm"
              >
                <span className="text-[var(--color-text)]">
                  {r.vehicles?.model} &middot; {r.accounts?.full_name || r.accounts?.email}
                </span>
                <span className="tabular text-[var(--color-text-muted)]">
                  {formatMinor(r.total_minor, r.currency, locale)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
