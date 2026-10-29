import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";

import { startRental } from "../../../rentals/actions";
import { CheckoutForm } from "./checkout-form";

export default async function CheckoutPage({
  params,
}: PageProps<"/[locale]/fleet/[vehicleId]/checkout">) {
  const { locale, vehicleId } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("rentals");

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from("vehicles")
    .select("id, model, status")
    .eq("id", vehicleId)
    .maybeSingle();
  if (!vehicle) {
    notFound();
  }
  if (vehicle.status !== "available") {
    return redirect({ href: `/fleet/${vehicleId}`, locale });
  }

  const { data: members } = await supabase
    .from("accounts")
    .select("id, full_name")
    .eq("role", "member")
    .order("full_name");

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-8">
      <h1 className="mb-1 text-2xl text-[var(--color-text)]">{t("checkoutTitle")}</h1>
      <p className="mb-6 text-sm text-[var(--color-text-muted)]">{vehicle.model}</p>
      <CheckoutForm action={startRental.bind(null, locale, vehicleId)} members={members ?? []} />
    </main>
  );
}
