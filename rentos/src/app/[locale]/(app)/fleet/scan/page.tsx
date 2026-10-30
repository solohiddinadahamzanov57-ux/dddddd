import { getTranslations, setRequestLocale } from "next-intl/server";

import { ScanClient } from "./scan-client";

export default async function ScanPage({ params }: PageProps<"/[locale]/fleet/scan">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("fleet");

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl text-[var(--color-text)]">{t("scanTitle")}</h1>
      <ScanClient />
    </main>
  );
}
