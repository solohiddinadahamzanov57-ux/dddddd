import "server-only";

import {
  createStripeDepositProvider,
  type DepositProvider,
  type StripeLike,
} from "./deposit-provider";
import { isStripeConfigured, getStripe } from "@/lib/stripe/client";

/** The deposit provider for this deployment, or null when card holds aren't configured (staff then mark deposits by hand). */
export function getDepositProvider(): DepositProvider | null {
  if (!isStripeConfigured()) return null;
  return createStripeDepositProvider(getStripe() as unknown as StripeLike);
}
