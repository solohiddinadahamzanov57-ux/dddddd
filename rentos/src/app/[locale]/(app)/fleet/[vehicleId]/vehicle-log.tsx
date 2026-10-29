import { useTranslations } from "next-intl";

import type { Json } from "@/lib/supabase/types";

export interface VehicleLogEntry {
  id: string;
  event_type: string;
  occurred_at: string;
  payload: Json;
  actor_account_id: string | null;
}

function describePayload(entry: VehicleLogEntry): string | null {
  const payload = entry.payload as Record<string, unknown> | null;
  if (!payload) return null;

  if (entry.event_type === "status_change") {
    const { from, to } = payload as { from?: string; to?: string };
    if (from && to) return `${from} → ${to}`;
  }
  if (entry.event_type === "note") {
    const { note } = payload as { note?: string };
    if (note) return note;
  }
  return null;
}

export function VehicleLog({ entries }: { entries: VehicleLogEntry[] }) {
  const t = useTranslations("fleet");

  if (entries.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">{t("noLogEntries")}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => {
        const detail = describePayload(entry);
        return (
          <li
            key={entry.id}
            className="flex items-baseline justify-between gap-3 border-b border-[var(--color-border)] pb-2 text-sm"
          >
            <span className="text-[var(--color-text)]">
              {t(`logEvent.${entry.event_type}`)}
              {detail && <span className="text-[var(--color-text-muted)]"> &middot; {detail}</span>}
            </span>
            <time className="tabular shrink-0 text-xs text-[var(--color-text-muted)]">
              {new Date(entry.occurred_at).toLocaleString()}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
