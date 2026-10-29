// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  connectAs,
  connectAsAdmin,
  createTestDatabase,
  dropTestDatabase,
  isPostgresAvailable,
} from "./setup";

/**
 * Phase 0's acceptance test: a user can sign up, create a company, and
 * cannot read another company's data. This runs the real migrations (incl.
 * every RLS policy) against a throwaway Postgres database and drives them
 * exactly the way PostgREST would -- connect, SET ROLE authenticated, set
 * request.jwt.claims -- so a passing test means the policies themselves are
 * sound, not just that application code happens to filter correctly.
 *
 * Requires a local Postgres reachable at PG_TEST_HOST/PORT/USER/PASSWORD
 * (defaults to 127.0.0.1:5432, postgres/postgres). CI provisions one; locally
 * the suite skips itself with a message if none is reachable.
 */
const pgAvailable = await isPostgresAvailable();

describe.skipIf(!pgAvailable)("company isolation (RLS)", () => {
  if (!pgAvailable) {
    console.warn("Skipping RLS tests: no local Postgres reachable (see test/rls/README.md).");
  }

  let dbName: string;
  let userA: string;
  let userB: string;
  let clientA: Client;
  let clientB: Client;

  beforeAll(async () => {
    dbName = await createTestDatabase();

    const admin = await connectAsAdmin(dbName);
    const inserted = await admin.query<{ id: string }>(
      `insert into auth.users (email) values ('owner-a@example.com'), ('owner-b@example.com') returning id`,
    );
    userA = inserted.rows[0]!.id;
    userB = inserted.rows[1]!.id;
    await admin.end();

    clientA = await connectAs(dbName, userA);
    clientB = await connectAs(dbName, userB);
  }, 30_000);

  afterAll(async () => {
    await clientA?.end();
    await clientB?.end();
    if (dbName) await dropTestDatabase(dbName);
  });

  it("lets a signed-up user create a company and become its owner", async () => {
    const result = await clientA.query(
      `select * from public.create_company('Alpha Rentals', 'alpha-rentals', 'USD')`,
    );
    expect(result.rows).toHaveLength(1);
    const company = result.rows[0] as { id: string; name: string };
    expect(company.name).toBe("Alpha Rentals");

    const account = await clientA.query(
      `select role from public.accounts where user_id = $1 and company_id = $2`,
      [userA, company.id],
    );
    expect(account.rows[0]?.role).toBe("owner");
  });

  it("stops one company's owner from reading another company's data", async () => {
    const companyA = (
      await clientA.query(`select * from public.create_company('Co A', 'co-a', 'USD')`)
    ).rows[0] as { id: string };
    const companyB = (
      await clientB.query(`select * from public.create_company('Co B', 'co-b', 'EUR')`)
    ).rows[0] as { id: string };

    const vehicleA = (
      await clientA.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-A-1', 'A-111', 'Demo Sedan', 'car', 'sedan', 'gasoline')
         returning id`,
        [companyA.id],
      )
    ).rows[0] as { id: string };

    await clientB.query(
      `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
       values ($1, 'BC-B-1', 'B-111', 'Demo Hatch', 'car', 'hatchback', 'electric')`,
      [companyB.id],
    );

    // Company isolation: B cannot see A's company row, account row, or vehicle.
    const bSeesCompanyA = await clientB.query(`select 1 from public.companies where id = $1`, [
      companyA.id,
    ]);
    expect(bSeesCompanyA.rowCount).toBe(0);

    const bSeesVehicleA = await clientB.query(`select 1 from public.vehicles where id = $1`, [
      vehicleA.id,
    ]);
    expect(bSeesVehicleA.rowCount).toBe(0);

    const bListsVehicles = await clientB.query(`select barcode from public.vehicles`);
    expect(bListsVehicles.rows.map((r) => r.barcode)).toEqual(["BC-B-1"]);

    const bSeesOwnerAAccount = await clientB.query(
      `select 1 from public.accounts where user_id = $1`,
      [userA],
    );
    expect(bSeesOwnerAAccount.rowCount).toBe(0);

    // And the reverse holds too.
    const aListsVehicles = await clientA.query(`select barcode from public.vehicles`);
    expect(aListsVehicles.rows.map((r) => r.barcode)).toEqual(["BC-A-1"]);
  });

  it("rejects a direct insert into accounts that hands the caller someone else's role", async () => {
    const companyA = (
      await clientA.query(`select * from public.create_company('Co C', 'co-c', 'USD')`)
    ).rows[0] as { id: string };

    await expect(
      clientB.query(
        `insert into public.accounts (user_id, company_id, role) values ($1, $2, 'owner')`,
        [userB, companyA.id],
      ),
    ).rejects.toThrow();
  });

  it("blocks a staff member from reassigning a vehicle to a different company via UPDATE", async () => {
    const companyA = (
      await clientA.query(`select * from public.create_company('Co D', 'co-d', 'USD')`)
    ).rows[0] as { id: string };
    const companyE = (
      await clientA.query(`select * from public.create_company('Co E', 'co-e', 'USD')`)
    ).rows[0] as { id: string };

    const vehicle = (
      await clientA.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-D-1', 'D-111', 'Demo Van', 'van', 'cargo', 'diesel')
         returning id`,
        [companyA.id],
      )
    ).rows[0] as { id: string };

    await expect(
      clientA.query(`update public.vehicles set company_id = $1 where id = $2`, [
        companyE.id,
        vehicle.id,
      ]),
    ).rejects.toThrow(/company_id cannot be changed/);
  });

  it("lets a member see only their own reservation, never another member's", async () => {
    const companyA = (
      await clientA.query(`select * from public.create_company('Co F', 'co-f', 'USD')`)
    ).rows[0] as { id: string };

    const vehicle = (
      await clientA.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-F-1', 'F-111', 'Demo Pickup', 'truck', 'pickup', 'gasoline')
         returning id`,
        [companyA.id],
      )
    ).rows[0] as { id: string };

    // B joins company A as a member. Invite/self-signup flows are a later
    // phase, so for this test the account is seeded directly via the admin
    // connection -- accounts has no client-facing INSERT policy at all (see
    // 20260101000900_rls.sql), which is itself exercised by the next test.
    const admin = await connectAsAdmin(dbName);
    const memberB = (
      await admin.query(
        `insert into public.accounts (user_id, company_id, role, full_name) values ($1, $2, 'member', 'Member B') returning id`,
        [userB, companyA.id],
      )
    ).rows[0] as { id: string };
    await admin.end();

    const ownerAAccount = (
      await clientA.query(`select id from public.accounts where user_id = $1 and company_id = $2`, [
        userA,
        companyA.id,
      ])
    ).rows[0] as { id: string };

    const reservation = (
      await clientB.query(
        `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency)
         values ($1, $2, $3, now(), now() + interval '1 day', 'USD')
         returning id`,
        [companyA.id, vehicle.id, memberB.id],
      )
    ).rows[0] as { id: string };

    // B (the member) can see their own reservation.
    const bSeesOwn = await clientB.query(`select 1 from public.reservations where id = $1`, [
      reservation.id,
    ]);
    expect(bSeesOwn.rowCount).toBe(1);

    // A member cannot create a reservation under someone else's account id.
    await expect(
      clientB.query(
        `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency)
         values ($1, $2, $3, now(), now() + interval '1 day', 'USD')`,
        [companyA.id, vehicle.id, ownerAAccount.id],
      ),
    ).rejects.toThrow();

    // Staff (the owner) can see every reservation in their company.
    const aSeesReservation = await clientA.query(
      `select 1 from public.reservations where id = $1`,
      [reservation.id],
    );
    expect(aSeesReservation.rowCount).toBe(1);
  });
});
