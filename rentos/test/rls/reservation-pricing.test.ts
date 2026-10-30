// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { calculateReservationQuote } from "../../src/lib/billing/fees";

import {
  connectAs,
  connectAsAdmin,
  createTestDatabase,
  dropTestDatabase,
  isPostgresAvailable,
} from "./setup";

const pgAvailable = await isPostgresAvailable();

const TARIFF = {
  hourlyRateMinor: 1250,
  dailyRateMinor: 7000,
  weeklyRateMinor: 40000,
  gracePeriodMinutes: 15,
  lateFeePerHourMinor: 1500,
  taxRateBps: 1900,
};

describe.skipIf(!pgAvailable)("server-authoritative reservation pricing", () => {
  let dbName: string;
  let admin: Client;
  let owner: Client;
  let customer: Client;
  let otherOwner: Client;
  let companyId: string;
  let otherCompanyId: string;
  let customerAccountId: string;
  let vehicleId: string;
  let otherVehicleId: string;

  const insertAsCustomer = (extra: { vehicle?: string; company?: string; total?: number } = {}) =>
    customer.query<{
      id: string;
      status: string;
      currency: string;
      subtotal_minor: number;
      tax_minor: number;
      total_minor: number;
      tariff_snapshot: Record<string, unknown>;
    }>(
      `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency, subtotal_minor, tax_minor, total_minor, tariff_snapshot, status)
       values ($1, $2, $3, '2031-01-01T10:00:00Z', '2031-01-02T10:00:00Z', 'EUR', 1, 0, $4, '{"hourlyRateMinor":0}', 'confirmed')
       returning *`,
      [extra.company ?? companyId, extra.vehicle ?? vehicleId, customerAccountId, extra.total ?? 1],
    );

  beforeAll(async () => {
    dbName = await createTestDatabase();
    admin = await connectAsAdmin(dbName);
    const users = await admin.query<{ id: string }>(
      `insert into auth.users (email) values ('o@pr.test'), ('c@pr.test'), ('o2@pr.test') returning id`,
    );
    const [ownerId, customerId, otherOwnerId] = users.rows.map((r) => r.id) as [string, string, string];
    owner = await connectAs(dbName, ownerId);
    customer = await connectAs(dbName, customerId);
    otherOwner = await connectAs(dbName, otherOwnerId);

    companyId = (await owner.query(`select * from public.create_company('Pricing Co', 'pricing-co', 'USD')`)).rows[0].id;
    otherCompanyId = (await otherOwner.query(`select * from public.create_company('Rival Co', 'rival-co', 'USD')`)).rows[0].id;
    await owner.query(`update public.companies set tax_rate_bps = $2 where id = $1`, [companyId, TARIFF.taxRateBps]);
    await owner.query(
      `insert into public.tariffs (company_id, currency, hourly_rate_minor, daily_rate_minor, weekly_rate_minor, grace_period_minutes, late_fee_per_hour_minor)
       values ($1, 'USD', $2, $3, $4, $5, $6)`,
      [companyId, TARIFF.hourlyRateMinor, TARIFF.dailyRateMinor, TARIFF.weeklyRateMinor, TARIFF.gracePeriodMinutes, TARIFF.lateFeePerHourMinor],
    );
    vehicleId = (await owner.query(
      `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
       values ($1, 'PR-1', 'PR-1', 'Priced Sedan', 'car', 'sedan', 'gasoline') returning id`, [companyId])).rows[0].id;
    otherVehicleId = (await otherOwner.query(
      `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
       values ($1, 'RV-1', 'RV-1', 'Rival Sedan', 'car', 'sedan', 'gasoline') returning id`, [otherCompanyId])).rows[0].id;

    await customer.query(`select public.join_company_as_member('pricing-co')`);
    customerAccountId = (await customer.query(`select id from public.accounts where user_id = $1`, [customerId])).rows[0].id;
  }, 60_000);

  afterAll(async () => {
    for (const c of [owner, customer, otherOwner, admin]) await c?.end();
    if (dbName) await dropTestDatabase(dbName);
  });

  it("overwrites every money column and the rate snapshot a customer sends", async () => {
    const { rows } = await insertAsCustomer({ total: 1 });
    const row = rows[0]!;
    expect(row.status).toBe("pending");
    expect(row.currency).toBe("USD");
    // 24 h at 70.00/day, 19% tax.
    expect(row).toMatchObject({ subtotal_minor: 7000, tax_minor: 1330, total_minor: 8330 });
    expect(row.tariff_snapshot).toMatchObject({
      hourlyRateMinor: 1250,
      dailyRateMinor: 7000,
      weeklyRateMinor: 40000,
      lateFeePerHourMinor: 1500,
      taxRateBps: 1900,
    });
  });

  it("matches the TypeScript fee code for every duration on a wide grid", async () => {
    const minutes = [
      1, 14, 30, 59, 60, 61, 90, 119, 120, 121, 300, 599, 600, 601, 1000, 1379, 1380, 1439, 1440,
      1441, 1500, 2000, 2879, 2880, 2881, 4000, 4320, 8639, 8640, 8641, 10079, 10080, 10081, 12000,
      14399, 14400, 14401, 20159, 20160, 20161, 30000, 43200, 43201, 100000,
    ];
    const start = new Date("2031-03-01T08:00:00Z");
    for (const m of minutes) {
      const end = new Date(start.getTime() + m * 60_000);
      // quote_reservation is internal (not executable by signed-in users); read it as the superuser.
      const result = await admin.query(`select * from public.quote_reservation($1, $2, $3)`, [
        vehicleId,
        start.toISOString(),
        end.toISOString(),
      ]);
      const ts = calculateReservationQuote(start, end, TARIFF);
      expect(
        { m, subtotal: result.rows[0].subtotal_minor, tax: result.rows[0].tax_minor, total: result.rows[0].total_minor },
        `duration ${m} min`,
      ).toEqual({ m, subtotal: ts.subtotalMinor, tax: ts.taxMinor, total: ts.totalMinor });
    }
  });

  it("refuses a reservation at a company with no price list", async () => {
    const bare = (await otherOwner.query(
      `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
       values ($1, 'RV-2', 'RV-2', 'Unpriced', 'car', 'sedan', 'gasoline') returning id`, [otherCompanyId])).rows[0].id;
    const guest = await admin.query(`insert into auth.users (email) values ('guest@pr.test') returning id`);
    const guestClient = await connectAs(dbName, guest.rows[0].id);
    await guestClient.query(`select public.join_company_as_member('rival-co')`);
    const acct = (await guestClient.query(`select id from public.accounts where user_id = $1`, [guest.rows[0].id])).rows[0].id;
    await expect(
      guestClient.query(
        `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency)
         values ($1, $2, $3, '2031-05-01T10:00:00Z', '2031-05-02T10:00:00Z', 'USD')`,
        [otherCompanyId, bare, acct],
      ),
    ).rejects.toThrow(/no_tariff/);
    await guestClient.end();
  });

  it("will not attach a reservation to another company's vehicle, or to someone else's company", async () => {
    await expect(insertAsCustomer({ vehicle: otherVehicleId })).rejects.toThrow(/must belong to the reservation's company/);
    await expect(insertAsCustomer({ company: otherCompanyId, vehicle: otherVehicleId })).rejects.toThrow(
      /must belong to the reservation's company|row-level security/,
    );
  });

  it("quote_reservation is not callable by signed-in users or anon", async () => {
    await expect(customer.query(`select * from public.quote_reservation($1, now(), now() + interval '1 day')`, [vehicleId])).rejects.toThrow(/permission denied/);
  });
});
