import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { markDepositHeld } from "./deposit-webhook";

function fakeAdmin(deposit: { amount_minor: number; status: string } | null) {
  const updates: Array<Record<string, unknown>> = [];
  const filters: Array<[string, unknown]> = [];
  const update = vi.fn((values: Record<string, unknown>) => {
    updates.push(values);
    const chain = {
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        // The real query builder is chainable and awaitable; the second filter ends the query.
        return filters.length >= 2 ? Promise.resolve({ error: null }) : chain;
      },
    };
    return chain;
  });
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: deposit }) }) }),
      update,
    }),
  };
  return { admin: admin as unknown as SupabaseClient<Database>, updates, filters };
}

const session = {
  metadata: { kind: "deposit", reservationId: "r1" },
  payment_intent: "pi_1",
  amount_total: 20000,
};

describe("markDepositHeld", () => {
  it("moves a pending deposit to held and records the payment intent", async () => {
    const { admin, updates, filters } = fakeAdmin({ amount_minor: 20000, status: "pending" });
    await expect(markDepositHeld(admin, session)).resolves.toBe("held");
    expect(updates).toEqual([{ status: "held", provider: "stripe", provider_ref: "pi_1" }]);
    expect(filters).toEqual([
      ["reservation_id", "r1"],
      ["status", "pending"],
    ]);
  });

  it("ignores sessions that are not deposits", async () => {
    const { admin, updates } = fakeAdmin({ amount_minor: 20000, status: "pending" });
    await expect(
      markDepositHeld(admin, { ...session, metadata: { reservationId: "r1" } }),
    ).resolves.toBe("ignored");
    expect(updates).toEqual([]);
  });

  it("does nothing the second time Stripe delivers the same event", async () => {
    const { admin, updates } = fakeAdmin({ amount_minor: 20000, status: "held" });
    await expect(markDepositHeld(admin, session)).resolves.toBe("ignored");
    expect(updates).toEqual([]);
  });

  it("refuses to mark a deposit held when the authorised amount is too small", async () => {
    const { admin, updates } = fakeAdmin({ amount_minor: 20000, status: "pending" });
    await expect(markDepositHeld(admin, { ...session, amount_total: 100 })).resolves.toBe(
      "amount_mismatch",
    );
    expect(updates).toEqual([]);
  });

  it("ignores an unknown reservation or a missing payment intent", async () => {
    expect(await markDepositHeld(fakeAdmin(null).admin, session)).toBe("ignored");
    expect(
      await markDepositHeld(fakeAdmin({ amount_minor: 1, status: "pending" }).admin, {
        ...session,
        payment_intent: null,
      }),
    ).toBe("ignored");
  });
});
