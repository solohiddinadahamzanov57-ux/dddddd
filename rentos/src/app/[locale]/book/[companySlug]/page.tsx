import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { BookingHeader } from "@/components/booking/booking-header";
import { bookingSearchSchema } from "@/lib/booking/schemas";
import { getPublicCompany, searchAvailableVehicles } from "@/lib/booking/data";
import { createClient } from "@/lib/supabase/server";

import { BookingVehicleCard } from "./booking-vehicle-card";
import { SearchForm } from "./search-form";

export default async function BookingSearchPage({
  params,
  searchParams,
}: PageProps<"/[locale]/book/[companySlug]">) {
  const { locale, companySlug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("booking");

  const supabase = await createClient();
  const company = await getPublicCompany(supabase, companySlug);
  if (!company) {
    notFound();
  }

  const rawParams = await searchParams;
  const parsed = bookingSearchSchema.safeParse({
    startAt: typeof rawParams.startAt === "string" ? rawParams.startAt : undefined,
    endAt: typeof rawParams.endAt === "string" ? rawParams.endAt : undefined,
    type: typeof rawParams.type === "string" ? rawParams.type : undefined,
  });

  const vehicles =
    parsed.success && parsed.data.startAt && parsed.data.endAt
      ? await searchAvailableVehicles(supabase, {
          companySlug,
          startAt: new Date(parsed.data.startAt).toISOString(),
          endAt: new Date(parsed.data.endAt).toISOString(),
          type: parsed.data.type,
        })
      : [];

  return (
    <div className="flex flex-1 flex-col">
      <BookingHeader companyName={company.name} companySlug={companySlug} />
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-8">
        <h1 className="text-2xl text-[var(--color-text)]">
          {t("title", { company: company.name })}
        </h1>
        <SearchForm companySlug={companySlug} />
        {parsed.success ? (
          vehicles.length === 0 ? (
            <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">
              {t("noResults")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {vehicles.map((v) => (
                <BookingVehicleCard
                  key={v.vehicle_id}
                  companySlug={companySlug}
                  startAt={parsed.data!.startAt}
                  endAt={parsed.data!.endAt}
                  vehicle={v}
                />
              ))}
            </div>
          )
        ) : (
          <p className="py-12 text-center text-sm text-[var(--color-text-muted)]">
            {t("choosePrompt")}
          </p>
        )}
      </main>
    </div>
  );
}
