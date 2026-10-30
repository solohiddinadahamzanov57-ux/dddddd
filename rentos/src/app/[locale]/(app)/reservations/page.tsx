import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { formatMinor } from "@/lib/billing/money";
import { createClient } from "@/lib/supabase/server";

const STATE_COLOR = {
  ok: { bg: "var(--color-status-available-bg)", fg: "var(--color-status-available)" },
  attention: { bg: "var(--color-status-rented-bg)", fg: "var(--color-status-rented)" },
  neutral: { bg: "var(--color-surface)", fg: "var(--color-text-muted)" },
} as const;

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: keyof typeof STATE_COLOR;
}) {
  const color = STATE_COLOR[tone];
  return (
    <span
      className="rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: color.bg, color: color.fg }}
    >
      {label}: {value}
    </span>
  );
}

export default async function ReservationsPage({ params }: PageProps<"/[locale]/reservations">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("reservations");

  const supabase = await createClient();
  const { data: reservations } = await supabase
    .from("reservations")
    .select(
      "id, status, start_at, end_at, total_minor, currency, vehicles(model, license_plate), accounts!reservations_member_account_id_fkey(full_name, email)",
    )
    .in("status", ["pending", "confirmed"])
    .order("start_at", { ascending: true })
    .limit(100);

  const ids = (reservations ?? []).map((r) => r.id);
  const [identities, agreements, deposits, photos] = ids.length
    ? await Promise.all([
        supabase
          .from("identity_verifications")
          .select("reservation_id, status")
          .in("reservation_id", ids),
        supabase.from("rental_agreements").select("reservation_id").in("reservation_id", ids),
        supabase
          .from("reservation_deposits")
          .select("reservation_id, status")
          .in("reservation_id", ids),
        supabase
          .from("handover_photos")
          .select("reservation_id, angle")
          .eq("phase", "pickup")
          .in("reservation_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const identityBy = new Map((identities.data ?? []).map((r) => [r.reservation_id, r.status]));
  const signed = new Set((agreements.data ?? []).map((r) => r.reservation_id));
  const depositBy = new Map((deposits.data ?? []).map((r) => [r.reservation_id, r.status]));
  const angleCount = new Map<string, Set<string>>();
  for (const p of photos.data ?? []) {
    const set = angleCount.get(p.reservation_id) ?? new Set<string>();
    if (p.angle !== "interior") set.add(p.angle);
    angleCount.set(p.reservation_id, set);
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl text-[var(--color-text)]">{t("title")}</h1>
      {(reservations ?? []).length === 0 && (
        <p className="text-sm text-[var(--color-text-muted)]">{t("empty")}</p>
      )}
      <ul className="flex flex-col gap-3">
        {(reservations ?? []).map((r) => {
          const idStatus = identityBy.get(r.id);
          const depositStatus = depositBy.get(r.id);
          const photoCount = angleCount.get(r.id)?.size ?? 0;
          return (
            <li key={r.id}>
              <Link
                href={`/reservations/${r.id}`}
                className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-raised)] p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {r.vehicles?.model} &middot; {r.vehicles?.license_plate}
                    </p>
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {r.accounts?.full_name || r.accounts?.email || t("unknownCustomer")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm text-[var(--color-text)]">
                      {formatMinor(r.total_minor, r.currency, locale)}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {t(`status.${r.status as "pending" | "confirmed"}`)}
                    </p>
                  </div>
                </div>
                <p className="tabular text-xs text-[var(--color-text-muted)]">
                  {new Date(r.start_at).toLocaleString(locale)} &rarr;{" "}
                  {new Date(r.end_at).toLocaleString(locale)}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    label={t("chip.id")}
                    value={t(`state.${idStatus ?? "none"}`)}
                    tone={
                      idStatus === "approved"
                        ? "ok"
                        : idStatus === "pending"
                          ? "attention"
                          : "neutral"
                    }
                  />
                  <Chip
                    label={t("chip.agreement")}
                    value={t(signed.has(r.id) ? "state.signed" : "state.unsigned")}
                    tone={signed.has(r.id) ? "ok" : "neutral"}
                  />
                  <Chip
                    label={t("chip.deposit")}
                    value={t(`state.${depositStatus ?? "none"}`)}
                    tone={
                      depositStatus === "held"
                        ? "ok"
                        : depositStatus === "pending"
                          ? "attention"
                          : "neutral"
                    }
                  />
                  <Chip
                    label={t("chip.photos")}
                    value={`${photoCount}/5`}
                    tone={photoCount === 5 ? "ok" : "neutral"}
                  />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
