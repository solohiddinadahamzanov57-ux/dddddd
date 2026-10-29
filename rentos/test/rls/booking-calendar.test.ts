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

describe.skipIf(!pgAvailable)("reservation calendar (no double-booking)", () => {
  let dbName: string;
  let owner: Client;
  let companyId: string;
  let vehicleId: string;
  let memberAccountId: string;

  beforeAll(async () => {
    dbName = await createTestDatabase();

    const admin = await connectAsAdmin(dbName);
    const inserted = await admin.query<{ id: string }>(
      `insert into auth.users (email) values ('owner-calendar@example.com'), ('member-calendar@example.com') returning id`,
    );
    const userId = inserted.rows[0]!.id;
    const memberUserId = inserted.rows[1]!.id;

    owner = await connectAs(dbName, userId);
    const company = (
      await owner.query(`select * from public.create_company('Calendar Co', 'calendar-co', 'USD')`)
    ).rows[0] as { id: string };
    companyId = company.id;

    const vehicle = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-CAL-1', 'CAL-1', 'Demo', 'car', 'sedan', 'gasoline')
         returning id`,
        [companyId],
      )
    ).rows[0] as { id: string };
    vehicleId = vehicle.id;

    const member = (
      await admin.query(
        `insert into public.accounts (user_id, company_id, role, full_name) values ($1, $2, 'member', 'Member') returning id`,
        [memberUserId, companyId],
      )
    ).rows[0] as { id: string };
    memberAccountId = member.id;
    await admin.end();
  }, 30_000);

  afterAll(async () => {
    await owner?.end();
    if (dbName) await dropTestDatabase(dbName);
  });

  async function reserve(startAt: string, endAt: string, status = "confirmed") {
    return owner.query(
      `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency, status)
       values ($1, $2, $3, $4, $5, 'USD', $6) returning id`,
      [companyId, vehicleId, memberAccountId, startAt, endAt, status],
    );
  }

  it("allows the first reservation for a time window", async () => {
    await expect(reserve("2026-03-01T10:00:00Z", "2026-03-02T10:00:00Z")).resolves.toBeDefined();
  });

  it("rejects an overlapping reservation for the same vehicle", async () => {
    await expect(reserve("2026-03-02T00:00:00Z", "2026-03-03T00:00:00Z")).rejects.toThrow(
      /conflicting key value|exclusion constraint/i,
    );
  });

  it("allows a back-to-back reservation that starts exactly when the other ends", async () => {
    await expect(reserve("2026-03-02T10:00:00Z", "2026-03-03T10:00:00Z")).resolves.toBeDefined();
  });

  it("allows overlapping time for a different vehicle", async () => {
    const otherVehicle = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-CAL-2', 'CAL-2', 'Demo 2', 'car', 'sedan', 'gasoline')
         returning id`,
        [companyId],
      )
    ).rows[0] as { id: string };

    await expect(
      owner.query(
        `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency, status)
         values ($1, $2, $3, '2026-03-01T10:00:00Z', '2026-03-02T10:00:00Z', 'USD', 'confirmed')`,
        [companyId, otherVehicle.id, memberAccountId],
      ),
    ).resolves.toBeDefined();
  });

  it("does not count a cancelled reservation as a conflict", async () => {
    const cancelled = await reserve("2026-04-01T10:00:00Z", "2026-04-02T10:00:00Z", "cancelled");
    const cancelledId = (cancelled.rows[0] as { id: string }).id;
    expect(cancelledId).toBeTruthy();

    await expect(
      reserve("2026-04-01T10:00:00Z", "2026-04-02T10:00:00Z", "confirmed"),
    ).resolves.toBeDefined();
  });
});
