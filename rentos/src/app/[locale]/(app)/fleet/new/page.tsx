import { getTranslations, setRequestLocale } from "next-intl/server";

import { VehicleForm } from "@/components/vehicles/vehicle-form";

import { createVehicle } from "../actions";

export default async function NewVehiclePage({ params }: PageProps<"/[locale]/fleet/new">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("fleet");

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <h1 className="mb-6 text-2xl text-[var(--color-text)]">{t("addVehicle")}</h1>
      <VehicleForm action={createVehicle.bind(null, locale)} submitLabel={t("addVehicle")} />
    </main>
  );
}
