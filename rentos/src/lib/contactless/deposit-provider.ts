import type Stripe from "stripe";

/** The slice of the Stripe client the deposit flow uses, so tests can pass a fake. */
export interface StripeLike {
  checkout: {
    sessions: {
      create(params: Stripe.Checkout.SessionCreateParams): Promise<{ url: string | null }>;
    };
  };
  paymentIntents: {
    cancel(id: string): Promise<unknown>;
    capture(id: string, params: { amount_to_capture: number }): Promise<unknown>;
  };
}

export interface DepositHoldInput {
  reservationId: string;
  companyId: string;
  amountMinor: number;
  currency: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * A deposit is an authorisation on the customer's card, not a charge: it is
 * released untouched after a clean return, or partly captured for damage,
 * fines or fees. Cards allow roughly seven days for an authorisation; longer
 * rentals need the company to collect the deposit another way.
 */
export interface DepositProvider {
  readonly id: "stripe";
  createHold(input: DepositHoldInput): Promise<{ url: string }>;
  release(providerRef: string): Promise<void>;
  capture(providerRef: string, amountMinor: number): Promise<void>;
}

export function createStripeDepositProvider(stripe: StripeLike): DepositProvider {
  return {
    id: "stripe",
    async createHold(input) {
      const metadata = {
        kind: "deposit",
        reservationId: input.reservationId,
        companyId: input.companyId,
      };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: input.currency.toLowerCase(),
              product_data: { name: input.description },
              unit_amount: input.amountMinor,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: { capture_method: "manual", metadata },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        metadata,
      });
      if (!session.url) {
        throw new Error("Stripe did not return a checkout URL for the deposit hold.");
      }
      return { url: session.url };
    },
    async release(providerRef) {
      await stripe.paymentIntents.cancel(providerRef);
    },
    async capture(providerRef, amountMinor) {
      await stripe.paymentIntents.capture(providerRef, { amount_to_capture: amountMinor });
    },
  };
}
