import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";

import type { Database } from "@/lib/supabase/types";

type Photo = {
  id: string;
  phase: string;
  angle: string;
  storage_path: string;
  created_at: string;
};

/**
 * Pickup and return photos for a reservation. The bucket is private; each
 * image is served through a one-hour signed link created with the viewer's own
 * session, so only people the storage policy allows can get one.
 */
export async function PhotoGallery({
  supabase,
  photos,
  locale,
}: {
  supabase: SupabaseClient<Database>;
  photos: Photo[];
  locale: string;
}) {
  const t = await getTranslations("reservations.photos");
  if (photos.length === 0) {
    return <p className="text-sm text-[var(--color-text-muted)]">{t("none")}</p>;
  }

  const signed = await supabase.storage.from("handover-photos").createSignedUrls(
    photos.map((p) => p.storage_path),
    3600,
  );
  const urlByPath = new Map((signed.data ?? []).map((s) => [s.path, s.signedUrl]));

  return (
    <>
      {(["pickup", "return"] as const).map((phase) => {
        const items = photos.filter((p) => p.phase === phase);
        if (items.length === 0) return null;
        return (
          <div key={phase} className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-[var(--color-text)]">{t(phase)}</h3>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {items.map((p) => {
                const url = urlByPath.get(p.storage_path);
                const label = `${t(`angle.${p.angle as "front"}`)}, ${new Date(p.created_at).toLocaleString(locale)}`;
                return (
                  <li key={p.id} className="flex flex-col gap-1">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL, nothing for next/image to optimise */}
                        <img
                          src={url}
                          alt={label}
                          className="aspect-[4/3] w-full rounded-md border border-[var(--color-border)] object-cover"
                        />
                      </a>
                    ) : (
                      <div className="aspect-[4/3] w-full rounded-md border border-dashed border-[var(--color-border)]" />
                    )}
                    <span className="tabular text-xs text-[var(--color-text-muted)]">{label}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}
