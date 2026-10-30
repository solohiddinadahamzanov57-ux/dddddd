import { notFound, redirect as nextRedirect } from "next/navigation";

import { getOrigin } from "@/lib/http/origin";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export default async function PayPage({
  params,
}: PageProps<"/[locale]/book/[companySlug]/reservations/[reservationId]/pay">) {
  const { companySlug, reservationId } = await params;

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    notFound();
  }

  const { data: reservation } = await supabase
    .from("reservations")
    .select("*, vehicles(model), companies(name)")
    .eq("id", reservationId)
    .maybeSingle();
  if (!reservation || reservation.status !== "pending") {
    notFound();
  }

  const origin = await getOrigin();
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: reservation.currency.toLowerCase(),
          product_data: {
            name: `${reservation.vehicles?.model ?? "Vehicle"} rental — ${reservation.companies?.name ?? ""}`,
          },
          unit_amount: reservation.total_minor,
        },
        quantity: 1,
      },
    ],
    success_url: `${origin}/book/${companySlug}/reservations/${reservationId}`,
    cancel_url: `${origin}/book/${companySlug}/reservations/${reservationId}`,
    metadata: { reservationId },
  });

  // Members can't insert into payments directly (staff-only RLS) -- this is
  // the customer's own, already-verified-above reservation, so the admin
  // client is the right trusted path, same as the walk-in member flow.
  const admin = createAdminClient();
  await admin.from("payments").insert({
    company_id: reservation.company_id,
    reservation_id: reservation.id,
    amount_minor: reservation.total_minor,
    currency: reservation.currency,
    method: "card",
    status: "pending",
    provider: "stripe",
    provider_payment_id: session.id,
  });

  nextRedirect(session.url!);
}
