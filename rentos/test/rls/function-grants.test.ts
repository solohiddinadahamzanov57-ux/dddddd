// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { connectAs, createTestDatabase, dropTestDatabase, isPostgresAvailable } from "./setup";

const pgAvailable = await isPostgresAvailable();

/**
 * A new Postgres function gets EXECUTE granted to anon/authenticated at
 * creation time on this project's (and a real Supabase project's) default
 * privileges -- `revoke all ... from public` alone doesn't take that back
 * from anon specifically. This caught a real gap across earlier phases'
 * migrations (fixed in 20260104000100_harden_function_grants.sql); this
 * test is what should catch it again if a future "authenticated only"
 * function forgets the explicit `from anon` revoke.
 */
describe.skipIf(!pgAvailable)("authenticated-only functions reject anon", () => {
  let dbName: string;
  let anon: Client;

  beforeAll(async () => {
    dbName = await createTestDatabase();
    anon = await connectAs(dbName, null);
  }, 30_000);

  afterAll(async () => {
    await anon?.end();
    if (dbName) await dropTestDatabase(dbName);
  });

  const deniedForAnon: Array<[name: string, sql: string]> = [
    ["current_company_ids", `select public.current_company_ids()`],
    [
      "current_role_in_company",
      `select public.current_role_in_company('00000000-0000-0000-0000-000000000000')`,
    ],
    [
      "is_staff_in_company",
      `select public.is_staff_in_company('00000000-0000-0000-0000-000000000000')`,
    ],
    ["my_account_ids", `select public.my_account_ids()`],
    ["create_company", `select public.create_company('x', 'x', 'USD')`],
    [
      "vehicle_profit_report",
      `select * from public.vehicle_profit_report('00000000-0000-0000-0000-000000000000', now(), now())`,
    ],
    ["join_company_as_member", `select public.join_company_as_member('x')`],
    // Trigger functions: run by their triggers only, never callable over the API.
    ["set_updated_at", `select public.set_updated_at()`],
    ["forbid_company_id_change", `select public.forbid_company_id_change()`],
    ["accounts_guard_update", `select public.accounts_guard_update()`],
    ["log_vehicle_status_change", `select public.log_vehicle_status_change()`],
  ];

  for (const [name, sql] of deniedForAnon) {
    it(`${name} is not callable by anon`, async () => {
      await expect(anon.query(sql)).rejects.toThrow(/permission denied/i);
    });
  }
});
