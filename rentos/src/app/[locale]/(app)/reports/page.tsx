import { getTranslations, setRequestLocale } from "next-intl/server";

import { formatMinor } from "@/lib/billing/money";
import { createClient } from "@/lib/supabase/server";

function monthRange(monthParam: string | undefined): { from: Date; to: Date; label: string } {
  const now = new Date();
  const [year, month] = monthParam?.match(/^\d{4}-\d{2}$/)
    ? monthParam.split("-").map(Number)
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];
  const from = new Date(Date.UTC(year!, month! - 1, 1));
  const to = new Date(Date.UTC(year!, month!, 1));
  return { from, to, label: `${year}-${String(month).padStart(2, "0")}` };
}

export default async function ReportsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/reports">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("reports");

  const rawParams = await searchParams;
  const { from, to, label } = monthRange(
    typeof rawParams.month === "string" ? rawParams.month : undefined,
  );

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("accounts")
    .select("company_id, companies(default_currency)")
    .limit(1)
    .maybeSingle();
  const currency = account?.companies?.default_currency ?? "USD";

  const { data: rows } = account
    ? await supabase.rpc("vehicle_profit_report", {
        p_company_id: account.company_id,
        p_from: from.toISOString(),
        p_to: to.toISOString(),
      })
    : { data: null };

  const totals = (rows ?? []).reduce(
    (acc, r) => ({
      revenue: acc.revenue + r.revenue_minor,
      expenses: acc.expenses + r.expenses_minor,
      profit: acc.profit + r.profit_minor,
    }),
    { revenue: 0, expenses: 0, profit: 0 },
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-[var(--color-text)]">{t("title")}</h1>
        <form className="flex items-center gap-2">
          <input
            type="month"
            name="month"
            defaultValue={label}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--color-text)]"
          />
          <button
            type="submit"
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)]"
          >
            {t("apply")}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label={t("revenue")} value={formatMinor(totals.revenue, currency, locale)} />
        <Stat label={t("expenses")} value={formatMinor(totals.expenses, currency, locale)} />
        <Stat label={t("profit")} value={formatMinor(totals.profit, currency, locale)} emphasize />
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
            <th className="py-2 font-normal">{t("vehicle")}</th>
            <th className="py-2 text-right font-normal">{t("rentals")}</th>
            <th className="py-2 text-right font-normal">{t("revenue")}</th>
            <th className="py-2 text-right font-normal">{t("expenses")}</th>
            <th className="py-2 text-right font-normal">{t("profit")}</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {(rows ?? []).map((r) => (
            <tr key={r.vehicle_id} className="border-b border-[var(--color-border)]">
              <td className="py-2 text-[var(--color-text)]">
                {r.model} &middot; {r.license_plate}
              </td>
              <td className="py-2 text-right text-[var(--color-text)]">{r.rental_count}</td>
              <td className="py-2 text-right text-[var(--color-text)]">
                {formatMinor(r.revenue_minor, currency, locale)}
              </td>
              <td className="py-2 text-right text-[var(--color-text)]">
                {formatMinor(r.expenses_minor, currency, locale)}
              </td>
              <td className="py-2 text-right text-[var(--color-text)]">
                {formatMinor(r.profit_minor, currency, locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(!rows || rows.length === 0) && (
        <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">{t("empty")}</p>
      )}
    </main>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-4">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      <p className={`tabular text-xl ${emphasize ? "font-medium" : ""} text-[var(--color-text)]`}>
        {value}
      </p>
    </div>
  );
}
