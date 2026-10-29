"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

import { BarcodeScanner } from "@/components/vehicles/barcode-scanner";
import { useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";

export function ScanClient() {
  const t = useTranslations("fleet");
  const router = useRouter();
  const [status, setStatus] = useState<"scanning" | "looking-up" | "not-found">("scanning");

  const handleResult = useCallback(
    async (barcode: string) => {
      setStatus("looking-up");
      const supabase = createClient();
      const { data } = await supabase
        .from("vehicles")
        .select("id")
        .eq("barcode", barcode)
        .maybeSingle();

      if (data) {
        router.push(`/fleet/${data.id}`);
      } else {
        setStatus("not-found");
      }
    },
    [router],
  );

  if (status === "not-found") {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[var(--color-status-service)]">{t("scanNotFound")}</p>
        <button
          type="button"
          onClick={() => setStatus("scanning")}
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm text-[var(--color-text)]"
        >
          {t("scanAgain")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <BarcodeScanner onResult={handleResult} />
      <p className="text-sm text-[var(--color-text-muted)]">
        {status === "looking-up" ? t("scanLookingUp") : t("scanPrompt")}
      </p>
    </div>
  );
}
