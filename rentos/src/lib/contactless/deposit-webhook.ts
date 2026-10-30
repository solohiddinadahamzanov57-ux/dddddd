import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

type CheckoutSessionLike = {
  metadata?: Record<string, string> | null;
  payment_intent?: string | { id: string } | null;
  amount_total?: number | null;
};

/**
 * Called from the signature-verified Stripe webhook when a Checkout session
 * completes. A deposit session is a card authorisation (manual capture), so
 * completion means the hold succeeded. Safe to call twice: only a `pending`
 * deposit moves to `held`, and only if the authorised amount covers it.
 */
export async function markDepositHeld(
  admin: SupabaseClient<Database>,
  session: CheckoutSessionLike,
): Promise<"held" | "ignored" | "amount_mismatch"> {
  const reservationId = session.metadata?.reservationId;
  if (session.metadata?.kind !== "deposit" || !reservationId) return "ignored";

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntentId) return "ignored";

  const { data: deposit } = await admin
    .from("reservation_deposits")
    .select("amount_minor, status")
    .eq("reservation_id", reservationId)
    .maybeSingle();
  if (!deposit || deposit.status !== "pending") return "ignored";

  if ((session.amount_total ?? 0) < deposit.amount_minor) return "amount_mismatch";

  const { error } = await admin
    .from("reservation_deposits")
    .update({ status: "held", provider: "stripe", provider_ref: paymentIntentId })
    .eq("reservation_id", reservationId)
    .eq("status", "pending");
  if (error) throw error;
  return "held";
}
