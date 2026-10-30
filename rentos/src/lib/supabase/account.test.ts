import { describe, expect, it, vi } from "vitest";

import { getStaffAccount, STAFF_ROLES } from "./account";

function fakeClient(result: unknown) {
  const calls: Array<[string, ...unknown[]]> = [];
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "in", "limit"]) {
    builder[method] = vi.fn((...args: unknown[]) => {
      calls.push([method, ...args]);
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(async () => ({ data: result }));
  const client = { from: vi.fn(() => builder) };
  return { client: client as never, calls };
}

describe("getStaffAccount", () => {
  it("looks up the caller's own row, restricted to staff roles", async () => {
    const row = { id: "a1", company_id: "c1", role: "owner", companies: null };
    const { client, calls } = fakeClient(row);

    await expect(getStaffAccount(client, "user-1")).resolves.toBe(row);

    expect(calls).toContainEqual(["eq", "user_id", "user-1"]);
    expect(calls).toContainEqual(["in", "role", [...STAFF_ROLES]]);
    expect(STAFF_ROLES).not.toContain("member");
  });
});
