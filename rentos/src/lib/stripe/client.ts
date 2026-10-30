import "server-only";

import Stripe from "stripe";

import { getServerEnv } from "@/lib/env";

/**
 * Throws clearly if Stripe isn't configured yet, instead of either crashing
 * obscurely or silently pretending payment succeeded. STRIPE_SECRET_KEY is
 * optional in env.ts since this project ships before real keys exist.
 */
export function getStripe(): Stripe {
  const env = getServerEnv();
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set -- payments aren't configured yet.");
  }
  return new Stripe(env.STRIPE_SECRET_KEY);
}

export function isStripeConfigured(): boolean {
  return Boolean(getServerEnv().STRIPE_SECRET_KEY);
}
