import { describe, expect, it, vi } from "vitest";

import { createStripeDepositProvider, type StripeLike } from "./deposit-provider";
import { fitWithin } from "./image";
import { contactlessErrorKey, isValidPhotoPath, photoStoragePath } from "./types";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const RESERVATION = "22222222-2222-4222-8222-222222222222";
const FILE = "33333333-3333-4333-8333-333333333333";

describe("photo paths", () => {
  it("builds the company/reservation/phase/file layout the database requires", () => {
    const path = photoStoragePath(COMPANY, RESERVATION, "pickup", FILE);
    expect(path).toBe(`${COMPANY}/${RESERVATION}/pickup/${FILE}.jpg`);
    expect(isValidPhotoPath(path)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of [
      "",
      "plate.jpg",
      `${COMPANY}/${RESERVATION}/pickup/plate.jpg`,
      `${COMPANY}/${RESERVATION}/other/${FILE}.jpg`,
      `${COMPANY}/${RESERVATION}/pickup/${FILE}.png`,
      `../${COMPANY}/${RESERVATION}/pickup/${FILE}.jpg`,
      `${COMPANY}/${RESERVATION}/pickup/${FILE}.jpg/extra`,
    ]) {
      expect(isValidPhotoPath(bad), bad).toBe(false);
    }
  });
});

describe("fitWithin", () => {
  it("shrinks the longest side to the limit and keeps the ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  });
  it("never upscales", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900, 1600)).toEqual({ width: 1600, height: 900 });
  });
});

describe("contactlessErrorKey", () => {
  it("maps known database errors and hides anything else", () => {
    expect(contactlessErrorKey("checks_incomplete")).toBe("errors.contactlessChecksIncomplete");
    expect(contactlessErrorKey("vehicle_not_available")).toBe("errors.vehicleNotAvailable");
    expect(contactlessErrorKey("rental_finished")).toBe("errors.rentalNotActive");
    expect(contactlessErrorKey("duplicate key value violates unique constraint")).toBe(
      "errors.generic",
    );
    expect(contactlessErrorKey(undefined)).toBe("errors.generic");
  });
});

describe("Stripe deposit provider", () => {
  function fakeStripe(url: string | null = "https://checkout.test/s/1") {
    const create = vi.fn(async (_params: unknown) => ({ url }));
    const cancel = vi.fn(async (_id: string) => ({}));
    const capture = vi.fn(async (_id: string, _params: { amount_to_capture: number }) => ({}));
    const stripe: StripeLike = {
      checkout: { sessions: { create } },
      paymentIntents: { cancel, capture },
    };
    return { stripe, create, cancel, capture };
  }

  const input = {
    reservationId: RESERVATION,
    companyId: COMPANY,
    amountMinor: 20000,
    currency: "USD",
    description: "Security deposit",
    successUrl: "https://app.test/ok",
    cancelUrl: "https://app.test/no",
  };

  it("authorises the card without charging it, and tags the payment so the webhook can find it", async () => {
    const { stripe, create } = fakeStripe();
    await expect(createStripeDepositProvider(stripe).createHold(input)).resolves.toEqual({
      url: "https://checkout.test/s/1",
    });
    const params = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(params).toMatchObject({
      mode: "payment",
      payment_intent_data: { capture_method: "manual" },
      metadata: { kind: "deposit", reservationId: RESERVATION, companyId: COMPANY },
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    expect(JSON.stringify(params)).toContain('"unit_amount":20000');
    expect(JSON.stringify(params)).toContain('"currency":"usd"');
  });

  it("fails loudly if Stripe returns no checkout URL", async () => {
    const { stripe } = fakeStripe(null);
    await expect(createStripeDepositProvider(stripe).createHold(input)).rejects.toThrow(
      /checkout URL/,
    );
  });

  it("releases by cancelling the authorisation and captures only the amount asked for", async () => {
    const { stripe, cancel, capture } = fakeStripe();
    const provider = createStripeDepositProvider(stripe);
    await provider.release("pi_123");
    await provider.capture("pi_456", 4500);
    expect(cancel).toHaveBeenCalledWith("pi_123");
    expect(capture).toHaveBeenCalledWith("pi_456", { amount_to_capture: 4500 });
  });
});
