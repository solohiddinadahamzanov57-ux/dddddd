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

describe.skipIf(!pgAvailable)("vehicle status-change log trigger", () => {
  let dbName: string;
  let owner: Client;
  let companyId: string;
  let vehicleId: string;

  beforeAll(async () => {
    dbName = await createTestDatabase();

    const admin = await connectAsAdmin(dbName);
    const inserted = await admin.query<{ id: string }>(
      `insert into auth.users (email) values ('owner-trigger@example.com') returning id`,
    );
    const userId = inserted.rows[0]!.id;
    await admin.end();

    owner = await connectAs(dbName, userId);
    const company = (
      await owner.query(`select * from public.create_company('Trigger Co', 'trigger-co', 'USD')`)
    ).rows[0] as { id: string };
    companyId = company.id;

    const vehicle = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type, status)
         values ($1, 'BC-T-1', 'T-111', 'Demo', 'car', 'sedan', 'gasoline', 'available')
         returning id`,
        [companyId],
      )
    ).rows[0] as { id: string };
    vehicleId = vehicle.id;
  }, 30_000);

  afterAll(async () => {
    await owner?.end();
    if (dbName) await dropTestDatabase(dbName);
  });

  it("does not log anything on insert", async () => {
    const logs = await owner.query(`select 1 from public.vehicle_logs where vehicle_id = $1`, [
      vehicleId,
    ]);
    expect(logs.rowCount).toBe(0);
  });

  it("logs a status_change row when status actually changes, with the actor and before/after payload", async () => {
    await owner.query(`update public.vehicles set status = 'service' where id = $1`, [vehicleId]);

    const logs = await owner.query<{
      event_type: string;
      payload: { from: string; to: string };
      actor_account_id: string;
    }>(
      `select event_type, payload, actor_account_id from public.vehicle_logs where vehicle_id = $1`,
      [vehicleId],
    );
    expect(logs.rowCount).toBe(1);
    expect(logs.rows[0]!.event_type).toBe("status_change");
    expect(logs.rows[0]!.payload).toEqual({ from: "available", to: "service" });
    expect(logs.rows[0]!.actor_account_id).not.toBeNull();
  });

  it("does not log an update that leaves status unchanged", async () => {
    await owner.query(`update public.vehicles set odometer = 999 where id = $1`, [vehicleId]);
    const logs = await owner.query(`select 1 from public.vehicle_logs where vehicle_id = $1`, [
      vehicleId,
    ]);
    expect(logs.rowCount).toBe(1); // still just the one from the previous test
  });
});
