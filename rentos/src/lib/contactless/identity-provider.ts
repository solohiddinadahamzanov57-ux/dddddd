/**
 * ID and licence verification sits behind this interface so a vendor
 * (Sumsub, Veriff, ...) can replace staff review without touching the
 * checklist. Only the outcome is ever stored: approved or rejected, the
 * licence expiry date and an "age confirmed" flag. No document images, no
 * document numbers.
 *
 * Today's only implementation is staff review: the customer asks, an
 * operator checks the document in person or over video and records the
 * result. A vendor implementation must write its result with the service
 * role from a signature-verified webhook, the same way the Stripe webhook
 * does; the customer-facing insert policy only allows a plain pending request.
 */
export interface IdentityProvider {
  readonly id: string;
  start(input: {
    reservationId: string;
    customerEmail: string | undefined;
  }): Promise<{ providerRef: string | null; redirectUrl: string | null }>;
}

export const staffReviewProvider: IdentityProvider = {
  id: "staff",
  async start() {
    return { providerRef: null, redirectUrl: null };
  },
};

export function getIdentityProvider(): IdentityProvider {
  return staffReviewProvider;
}
