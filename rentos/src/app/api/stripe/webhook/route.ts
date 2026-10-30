import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";

import { getServerEnv } from "@/lib/env";
import { markDepositHeld } from "@/lib/contactless/deposit-webhook";
import { notifyByEmail } from "@/lib/notifications/send";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const env = getServerEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe webhook not configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
  }

  return NextResponse.json({ received: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const reservationId = session.metadata?.reservationId;
  if (!reservationId) return;

  const admin = createAdminClient();

  // A card hold for the security deposit, not a payment for the rental.
  if (session.metadata?.kind === "deposit") {
    const outcome = await markDepositHeld(admin, session);
    if (outcome === "amount_mismatch") {
      console.error(
        "Stripe webhook: deposit authorisation smaller than the deposit",
        reservationId,
      );
    }
    return;
  }

  const { error: paymentError } = await admin
    .from("payments")
    .update({ status: "succeeded" })
    .eq("provider", "stripe")
    .eq("provider_payment_id", session.id);
  if (paymentError) {
    console.error("Stripe webhook: failed to update payment:", paymentError);
  }

  const { data: reservation, error: reservationError } = await admin
    .from("reservations")
    .update({ status: "confirmed" })
    .eq("id", reservationId)
    .eq("status", "pending")
    .select("id, company_id, member_account_id, vehicles(model), start_at, end_at")
    .maybeSingle();
  if (reservationError) {
    console.error("Stripe webhook: failed to confirm reservation:", reservationError);
    return;
  }
  if (!reservation) return; // already confirmed, or not found -- nothing more to do

  const { data: member } = await admin
    .from("accounts")
    .select("full_name, user_id")
    .eq("id", reservation.member_account_id)
    .maybeSingle();
  const { data: authUser } = member?.user_id
    ? await admin.auth.admin.getUserById(member.user_id)
    : { data: null };
  const email = authUser?.user?.email;

  if (email) {
    await notifyByEmail({
      companyId: reservation.company_id,
      accountId: reservation.member_account_id,
      type: "reservation_confirmed",
      to: email,
      subject: "Your reservation is confirmed",
      text: `Hi ${member?.full_name ?? ""},\n\nYour reservation for ${reservation.vehicles?.model ?? "your vehicle"} from ${reservation.start_at} to ${reservation.end_at} is confirmed. See you then!`,
    });
  }
}
