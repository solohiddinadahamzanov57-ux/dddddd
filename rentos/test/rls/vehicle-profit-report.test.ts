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

describe.skipIf(!pgAvailable)("vehicle_profit_report()", () => {
  let dbName: string;
  let owner: Client;
  let companyId: string;
  let vehicleAId: string;
  let vehicleBId: string;
  let memberId: string;

  beforeAll(async () => {
    dbName = await createTestDatabase();

    const admin = await connectAsAdmin(dbName);
    const inserted = await admin.query<{ id: string }>(
      `insert into auth.users (email) values ('owner-report@example.com'), ('member-report@example.com') returning id`,
    );
    const ownerUserId = inserted.rows[0]!.id;
    const memberUserId = inserted.rows[1]!.id;

    owner = await connectAs(dbName, ownerUserId);
    const company = (
      await owner.query(`select * from public.create_company('Report Co', 'report-co', 'USD')`)
    ).rows[0] as { id: string };
    companyId = company.id;

    const member = (
      await admin.query(
        `insert into public.accounts (user_id, company_id, role, full_name) values ($1, $2, 'member', 'Member') returning id`,
        [memberUserId, companyId],
      )
    ).rows[0] as { id: string };
    memberId = member.id;

    const vehicleA = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-RPT-A', 'RPT-A', 'Profitable Car', 'car', 'sedan', 'gasoline') returning id`,
        [companyId],
      )
    ).rows[0] as { id: string };
    vehicleAId = vehicleA.id;

    const vehicleB = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-RPT-B', 'RPT-B', 'Money Pit', 'car', 'hatchback', 'gasoline') returning id`,
        [companyId],
      )
    ).rows[0] as { id: string };
    vehicleBId = vehicleB.id;

    // Vehicle A: one completed rental worth $100, one $50 expense inside the window -> profit 10000
    await owner.query(
      `insert into public.rentals (company_id, vehicle_id, member_account_id, status, started_at, ended_at, odometer_start, odometer_end, currency, total_minor)
       values ($1, $2, $3, 'completed', '2026-05-01T10:00:00Z', '2026-05-02T10:00:00Z', 100, 150, 'USD', 10000)`,
      [companyId, vehicleAId, memberId],
    );
    await owner.query(
      `insert into public.expenses (company_id, vehicle_id, category, amount_minor, currency, occurred_on)
       values ($1, $2, 'fuel', 5000, 'USD', '2026-05-01')`,
      [companyId, vehicleAId],
    );

    // Vehicle A: a rental OUTSIDE the reporting window -- must not count.
    await owner.query(
      `insert into public.rentals (company_id, vehicle_id, member_account_id, status, started_at, ended_at, odometer_start, odometer_end, currency, total_minor)
       values ($1, $2, $3, 'completed', '2026-06-01T10:00:00Z', '2026-06-02T10:00:00Z', 150, 200, 'USD', 99999)`,
      [companyId, vehicleAId, memberId],
    );

    // Vehicle A: a rental still ACTIVE (not completed) in the window -- must not count as revenue.
    await owner.query(
      `insert into public.rentals (company_id, vehicle_id, member_account_id, status, started_at, odometer_start, currency)
       values ($1, $2, $3, 'active', '2026-05-15T10:00:00Z', 150, 'USD')`,
      [companyId, vehicleAId, memberId],
    );

    // Vehicle B: only an expense, no revenue -> negative profit.
    await owner.query(
      `insert into public.expenses (company_id, vehicle_id, category, amount_minor, currency, occurred_on)
       values ($1, $2, 'repair', 20000, 'USD', '2026-05-10')`,
      [companyId, vehicleBId],
    );

    await admin.end();
  }, 30_000);

  afterAll(async () => {
    await owner?.end();
    if (dbName) await dropTestDatabase(dbName);
  });

  it("aggregates revenue, expenses, and profit per vehicle within the period", async () => {
    const result = await owner.query<{
      vehicle_id: string;
      revenue_minor: string;
      expenses_minor: string;
      profit_minor: string;
      rental_count: string;
    }>(
      `select * from public.vehicle_profit_report($1, '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z')`,
      [companyId],
    );

    const byId = Object.fromEntries(result.rows.map((r) => [r.vehicle_id, r]));

    expect(byId[vehicleAId]!.revenue_minor).toBe("10000");
    expect(byId[vehicleAId]!.expenses_minor).toBe("5000");
    expect(byId[vehicleAId]!.profit_minor).toBe("5000");
    expect(byId[vehicleAId]!.rental_count).toBe("1");

    expect(byId[vehicleBId]!.revenue_minor).toBe("0");
    expect(byId[vehicleBId]!.expenses_minor).toBe("20000");
    expect(byId[vehicleBId]!.profit_minor).toBe("-20000");
  });

  it("is scoped to the given company", async () => {
    const otherCompany = (
      await owner.query(
        `select * from public.create_company('Other Report Co', 'other-report-co', 'USD')`,
      )
    ).rows[0] as { id: string };

    const result = await owner.query(
      `select * from public.vehicle_profit_report($1, '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z')`,
      [otherCompany.id],
    );
    expect(result.rowCount).toBe(0);
  });
});
