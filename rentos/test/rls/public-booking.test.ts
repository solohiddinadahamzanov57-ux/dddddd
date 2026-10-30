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

const pgAvailable = await isPostgresAvailable();

describe.skipIf(!pgAvailable)("public booking surface (anon access)", () => {
  let dbName: string;
  let owner: Client;
  let anon: Client;
  let companyId: string;
  let availableVehicleId: string;
  let serviceVehicleId: string;
  let memberUserId: string;

  beforeAll(async () => {
    dbName = await createTestDatabase();

    const admin = await connectAsAdmin(dbName);
    const inserted = await admin.query<{ id: string }>(
      `insert into auth.users (email) values ('owner-public@example.com'), ('customer-public@example.com') returning id`,
    );
    const ownerUserId = inserted.rows[0]!.id;
    memberUserId = inserted.rows[1]!.id;
    await admin.end();

    owner = await connectAs(dbName, ownerUserId);
    anon = await connectAs(dbName, null);

    const company = (
      await owner.query(`select * from public.create_company('Public Co', 'public-co', 'USD')`)
    ).rows[0] as { id: string };
    companyId = company.id;

    await owner.query(
      `insert into public.tariffs (company_id, currency, hourly_rate_minor, daily_rate_minor, weekly_rate_minor, late_fee_per_hour_minor)
       values ($1, 'USD', 1000, 5000, 25000, 1500)`,
      [companyId],
    );

    const available = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type, status)
         values ($1, 'BC-PUB-1', 'PUB-1', 'Bookable Sedan', 'car', 'sedan', 'gasoline', 'available') returning id`,
        [companyId],
      )
    ).rows[0] as { id: string };
    availableVehicleId = available.id;

    const service = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type, status)
         values ($1, 'BC-PUB-2', 'PUB-2', 'In the Shop', 'car', 'sedan', 'gasoline', 'service') returning id`,
        [companyId],
      )
    ).rows[0] as { id: string };
    serviceVehicleId = service.id;
  }, 30_000);

  afterAll(async () => {
    await owner?.end();
    await anon?.end();
    if (dbName) await dropTestDatabase(dbName);
  });

  it("anon cannot touch the underlying tables at all (no grants, and no policy admits it)", async () => {
    // Supabase grants anon table privileges by default; the
    // revoke_anon_table_grants migration removes them, so this is a hard
    // permission error rather than an RLS-filtered empty result. The public_*
    // functions above are the only way anon reaches this data.
    for (const table of ["vehicles", "companies", "tariffs", "accounts", "reservations"]) {
      await expect(anon.query(`select 1 from public.${table}`)).rejects.toThrow(
        /permission denied/,
      );
    }
  });

  it("anon can look up a company by slug through the curated function", async () => {
    const result = await anon.query(`select * from public.public_company_by_slug('public-co')`);
    expect(result.rows[0]?.name).toBe("Public Co");
  });

  it("anon can look up a single vehicle by id", async () => {
    const result = await anon.query(`select * from public.public_vehicle_by_id($1)`, [
      availableVehicleId,
    ]);
    expect(result.rows[0]?.model).toBe("Bookable Sedan");
  });

  it("public_vehicle_by_id excludes vehicles in service", async () => {
    const result = await anon.query(`select * from public.public_vehicle_by_id($1)`, [
      serviceVehicleId,
    ]);
    expect(result.rowCount).toBe(0);
  });

  it("anon can get the tariff for a vehicle type", async () => {
    const result = await anon.query(
      `select * from public.public_tariff_for_vehicle_type('public-co', 'car')`,
    );
    expect(result.rows[0]?.daily_rate_minor).toBe(5000);
  });

  it("search excludes service vehicles and includes available ones", async () => {
    const result = await anon.query<{ vehicle_id: string }>(
      `select * from public.search_available_vehicles('public-co', '2026-07-01T00:00:00Z', '2026-07-03T00:00:00Z')`,
    );
    const ids = result.rows.map((r) => r.vehicle_id);
    expect(ids).toContain(availableVehicleId);
    expect(ids).not.toContain(serviceVehicleId);
  });

  it("search excludes a vehicle with an overlapping confirmed reservation", async () => {
    const memberClient = await connectAs(dbName, memberUserId);
    await memberClient.query(`select public.join_company_as_member('public-co')`);
    const account = (
      await memberClient.query(`select id from public.accounts where user_id = $1`, [memberUserId])
    ).rows[0] as { id: string };

    await memberClient.query(
      `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency, status)
       values ($1, $2, $3, '2026-08-01T00:00:00Z', '2026-08-03T00:00:00Z', 'USD', 'confirmed')`,
      [companyId, availableVehicleId, account.id],
    );

    const overlapping = await anon.query<{ vehicle_id: string }>(
      `select * from public.search_available_vehicles('public-co', '2026-08-02T00:00:00Z', '2026-08-04T00:00:00Z')`,
    );
    expect(overlapping.rows.map((r) => r.vehicle_id)).not.toContain(availableVehicleId);

    const nonOverlapping = await anon.query<{ vehicle_id: string }>(
      `select * from public.search_available_vehicles('public-co', '2026-08-10T00:00:00Z', '2026-08-12T00:00:00Z')`,
    );
    expect(nonOverlapping.rows.map((r) => r.vehicle_id)).toContain(availableVehicleId);

    await memberClient.end();
  });

  it("anon cannot call join_company_as_member (authenticated only)", async () => {
    await expect(anon.query(`select public.join_company_as_member('public-co')`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it("join_company_as_member creates exactly one member account and is idempotent", async () => {
    const admin = await connectAsAdmin(dbName);
    const newUser = (
      await admin.query<{ id: string }>(
        `insert into auth.users (email) values ('idempotent@example.com') returning id`,
      )
    ).rows[0]!.id;
    await admin.end();

    const client = await connectAs(dbName, newUser);
    const first = await client.query(`select * from public.join_company_as_member('public-co')`);
    const second = await client.query(`select * from public.join_company_as_member('public-co')`);
    expect(first.rows[0].id).toBe(second.rows[0].id);
    expect(first.rows[0].role).toBe("member");

    const count = await client.query(
      `select count(*)::int as n from public.accounts where user_id = $1`,
      [newUser],
    );
    expect(count.rows[0]!.n).toBe(1);
    await client.end();
  });
});
