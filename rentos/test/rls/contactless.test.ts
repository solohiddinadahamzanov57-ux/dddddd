// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";

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

const ANGLES = ["front", "rear", "left", "right", "dashboard"] as const;
const HOUR = 3_600_000;

describe.skipIf(!pgAvailable)("contactless rental (Phase 4)", () => {
  let dbName: string;
  let admin: Client;
  let owner: Client;
  let customer: Client;
  let stranger: Client; // a customer of the same company who owns no reservation here
  let otherOwner: Client; // staff of a different company
  let anon: Client;

  let companyId: string;
  let customerAccountId: string;
  let strangerAccountId: string;
  let ownerAccountId: string;
  let carId: string;
  let vanId: string;

  const iso = (ms: number) => new Date(ms).toISOString();

  async function createReservation(vehicleId: string, startMs: number, endMs: number) {
    const result = await customer.query<{ id: string; status: string }>(
      `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency, subtotal_minor, total_minor)
       values ($1, $2, $3, $4, $5, 'USD', 10000, 10000) returning id, status`,
      [companyId, vehicleId, customerAccountId, iso(startMs), iso(endMs)],
    );
    return result.rows[0]!;
  }

  async function status(client: Client, reservationId: string) {
    const result = await client.query(`select * from public.contactless_status($1)`, [
      reservationId,
    ]);
    return result.rows[0] as Record<string, unknown> | undefined;
  }

  async function addPickupPhotos(reservationId: string, vehicleId: string, withFiles = true) {
    for (const angle of ANGLES) {
      const path = `${companyId}/${reservationId}/pickup/${randomUUID()}.jpg`;
      await customer.query(
        `insert into public.handover_photos (company_id, reservation_id, vehicle_id, phase, angle, storage_path, taken_by_account_id)
         values ($1, $2, $3, 'pickup', $4, $5, $6)`,
        [companyId, reservationId, vehicleId, angle, path, customerAccountId],
      );
      if (withFiles) {
        await admin.query(
          `insert into storage.objects (bucket_id, name) values ('handover-photos', $1)`,
          [path],
        );
      }
    }
  }

  /** Walks a reservation through every check the way real users would. */
  async function completeAllChecks(reservationId: string, vehicleId: string) {
    await owner.query(`update public.reservations set status = 'confirmed' where id = $1`, [
      reservationId,
    ]);
    await customer.query(
      `insert into public.identity_verifications (company_id, reservation_id, member_account_id)
       values ($1, $2, $3)`,
      [companyId, reservationId, customerAccountId],
    );
    await owner.query(
      `update public.identity_verifications
         set status = 'approved', license_valid_until = '2099-01-01', age_confirmed = true,
             reviewed_by_account_id = $2, reviewed_at = now()
       where reservation_id = $1`,
      [reservationId, ownerAccountId],
    );
    await customer.query(`select public.sign_rental_agreement($1, 'Casey Customer', 'en')`, [
      reservationId,
    ]);
    if (vehicleId === carId) {
      await customer.query(`select public.request_deposit($1)`, [reservationId]);
      await owner.query(
        `update public.reservation_deposits set status = 'held', provider = 'manual' where reservation_id = $1`,
        [reservationId],
      );
    }
    await addPickupPhotos(reservationId, vehicleId);
  }

  beforeAll(async () => {
    dbName = await createTestDatabase();
    admin = await connectAsAdmin(dbName);
    const users = await admin.query<{ id: string }>(
      `insert into auth.users (email) values
         ('owner@p4.test'), ('customer@p4.test'), ('stranger@p4.test'), ('other-owner@p4.test')
       returning id`,
    );
    const [ownerId, customerId, strangerId, otherOwnerId] = users.rows.map((r) => r.id) as [
      string,
      string,
      string,
      string,
    ];

    owner = await connectAs(dbName, ownerId);
    customer = await connectAs(dbName, customerId);
    stranger = await connectAs(dbName, strangerId);
    otherOwner = await connectAs(dbName, otherOwnerId);
    anon = await connectAs(dbName, null);

    companyId = (
      await owner.query(`select * from public.create_company('Contactless Co', 'contactless-co', 'USD')`)
    ).rows[0].id;
    await otherOwner.query(`select * from public.create_company('Elsewhere Co', 'elsewhere-co', 'EUR')`);

    ownerAccountId = (
      await owner.query(`select id from public.accounts where user_id = $1`, [ownerId])
    ).rows[0].id;

    await customer.query(`select public.join_company_as_member('contactless-co')`);
    await stranger.query(`select public.join_company_as_member('contactless-co')`);
    customerAccountId = (
      await customer.query(`select id from public.accounts where user_id = $1`, [customerId])
    ).rows[0].id;
    strangerAccountId = (
      await stranger.query(`select id from public.accounts where user_id = $1`, [strangerId])
    ).rows[0].id;

    // Cars need a 200.00 deposit; vans need none.
    await owner.query(
      `insert into public.tariffs (company_id, vehicle_type, currency, hourly_rate_minor, daily_rate_minor, weekly_rate_minor, late_fee_per_hour_minor, deposit_minor)
       values ($1, null, 'USD', 1000, 5000, 25000, 1500, 0),
              ($1, 'car', 'USD', 1200, 6000, 30000, 1500, 20000)`,
      [companyId],
    );

    carId = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type, odometer)
         values ($1, 'CL-CAR', 'CL-1', 'Contactless Sedan', 'car', 'sedan', 'gasoline', 12000) returning id`,
        [companyId],
      )
    ).rows[0].id;
    vanId = (
      await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'CL-VAN', 'CL-2', 'Contactless Van', 'van', 'cargo', 'diesel') returning id`,
        [companyId],
      )
    ).rows[0].id;

    await owner.query(`insert into public.vehicle_keyboxes (vehicle_id, company_id, code) values ($1, $2, '4821')`, [
      carId,
      companyId,
    ]);
    await owner.query(`insert into public.vehicle_keyboxes (vehicle_id, company_id, code) values ($1, $2, '7777')`, [
      vanId,
      companyId,
    ]);
  }, 60_000);

  afterAll(async () => {
    for (const c of [owner, customer, stranger, otherOwner, anon, admin]) await c?.end();
    if (dbName) await dropTestDatabase(dbName);
  });

  describe("customers cannot write their way past the checks", () => {
    it("a reservation a customer inserts is always pending, even if they ask for confirmed", async () => {
      const result = await customer.query(
        `insert into public.reservations (company_id, vehicle_id, member_account_id, start_at, end_at, currency, status)
         values ($1, $2, $3, $4, $5, 'USD', 'confirmed') returning status`,
        [companyId, vanId, customerAccountId, iso(Date.now() + 30 * 24 * HOUR), iso(Date.now() + 31 * 24 * HOUR)],
      );
      expect(result.rows[0].status).toBe("pending");
    });

    it("a customer cannot confirm their own reservation", async () => {
      const r = await createReservation(vanId, Date.now() + 40 * 24 * HOUR, Date.now() + 41 * 24 * HOUR);
      await expect(
        customer.query(`update public.reservations set status = 'confirmed' where id = $1`, [r.id]),
      ).rejects.toThrow(/customers can only cancel/);
    });

    it("a customer cannot rewrite price, vehicle or dates after booking", async () => {
      const r = await createReservation(vanId, Date.now() + 50 * 24 * HOUR, Date.now() + 51 * 24 * HOUR);
      await expect(
        customer.query(`update public.reservations set total_minor = 0 where id = $1`, [r.id]),
      ).rejects.toThrow(/cannot edit reservation details/);
      await expect(
        customer.query(`update public.reservations set end_at = end_at + interval '30 days' where id = $1`, [r.id]),
      ).rejects.toThrow(/cannot edit reservation details/);
    });

    it("a customer can still cancel, and staff can confirm", async () => {
      const r = await createReservation(vanId, Date.now() + 60 * 24 * HOUR, Date.now() + 61 * 24 * HOUR);
      await customer.query(`update public.reservations set status = 'cancelled' where id = $1`, [r.id]);
      const r2 = await createReservation(vanId, Date.now() + 70 * 24 * HOUR, Date.now() + 71 * 24 * HOUR);
      await owner.query(`update public.reservations set status = 'confirmed' where id = $1`, [r2.id]);
      const row = await owner.query(`select status from public.reservations where id = $1`, [r2.id]);
      expect(row.rows[0].status).toBe("confirmed");
    });
  });

  describe("keybox codes", () => {
    it("customers, other customers and anon cannot read the keybox table", async () => {
      expect((await customer.query(`select * from public.vehicle_keyboxes`)).rowCount).toBe(0);
      expect((await stranger.query(`select * from public.vehicle_keyboxes`)).rowCount).toBe(0);
      await expect(anon.query(`select * from public.vehicle_keyboxes`)).rejects.toThrow(/permission denied/);
    });

    it("staff can read and manage them, but only for their own vehicles", async () => {
      expect((await owner.query(`select code from public.vehicle_keyboxes where vehicle_id = $1`, [carId])).rows[0].code).toBe("4821");
      expect((await otherOwner.query(`select * from public.vehicle_keyboxes`)).rowCount).toBe(0);
      const foreignVehicle = (
        await owner.query(
          `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
           values ($1, 'CL-X', 'CL-X', 'Spare', 'car', 'sedan', 'gasoline') returning id`,
          [companyId],
        )
      ).rows[0].id;
      await expect(
        otherOwner.query(`insert into public.vehicle_keyboxes (vehicle_id, company_id, code) values ($1, (select company_id from public.accounts limit 1), '0000')`, [foreignVehicle]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  describe("the checklist", () => {
    let reservationId: string;

    beforeAll(async () => {
      reservationId = (await createReservation(carId, Date.now() + 1 * HOUR, Date.now() + 49 * HOUR)).id;
    });

    it("starts with everything outstanding", async () => {
      const s = await status(customer, reservationId);
      expect(s).toMatchObject({
        reservation_confirmed: false,
        identity_ok: false,
        agreement_signed: false,
        deposit_required_minor: 20000,
        deposit_ok: false,
        photos_present: 0,
        photos_ok: false,
        keybox_configured: true,
        in_pickup_window: true,
        all_ok: false,
        can_unlock: false,
      });
    });

    it("hides the checklist from other customers, other companies and anon", async () => {
      expect(await status(stranger, reservationId)).toBeUndefined();
      expect(await status(otherOwner, reservationId)).toBeUndefined();
      await expect(anon.query(`select * from public.contactless_status($1)`, [reservationId])).rejects.toThrow(/permission denied/);
    });

    it("identity: a customer can ask but cannot approve themselves", async () => {
      await expect(
        customer.query(
          `insert into public.identity_verifications (company_id, reservation_id, member_account_id, status, license_valid_until, age_confirmed, reviewed_at)
           values ($1, $2, $3, 'approved', '2099-01-01', true, now())`,
          [companyId, reservationId, customerAccountId],
        ),
      ).rejects.toThrow(/row-level security|violates/);

      await customer.query(
        `insert into public.identity_verifications (company_id, reservation_id, member_account_id) values ($1, $2, $3)`,
        [companyId, reservationId, customerAccountId],
      );
      const selfApprove = await customer.query(
        `update public.identity_verifications set status = 'approved', license_valid_until = '2099-01-01', age_confirmed = true, reviewed_at = now() where reservation_id = $1`,
        [reservationId],
      );
      expect(selfApprove.rowCount).toBe(0);
      expect((await status(customer, reservationId))?.identity_status).toBe("pending");
    });

    it("identity: approval needs the licence to outlast the rental", async () => {
      await owner.query(
        `update public.identity_verifications
           set status = 'approved', license_valid_until = current_date, age_confirmed = true,
               reviewed_by_account_id = $2, reviewed_at = now()
         where reservation_id = $1`,
        [reservationId, ownerAccountId],
      );
      expect((await status(customer, reservationId))?.identity_ok).toBe(false);

      await owner.query(`update public.identity_verifications set license_valid_until = '2099-01-01' where reservation_id = $1`, [reservationId]);
      expect((await status(customer, reservationId))?.identity_ok).toBe(true);
    });

    it("identity: an approval without a licence date or age confirmation is rejected by the table", async () => {
      await expect(
        owner.query(`update public.identity_verifications set license_valid_until = null where reservation_id = $1`, [reservationId]),
      ).rejects.toThrow(/identity_approved_has_details/);
    });

    it("agreement: the text is built in the database and the signature is stored with its hash", async () => {
      const rendered = await customer.query<{ version: string; body: string }>(
        `select * from public.render_rental_agreement($1, 'en')`,
        [reservationId],
      );
      const body = rendered.rows[0]!.body;
      expect(body).toContain("Contactless Co");
      expect(body).toContain("Contactless Sedan (CL-1)");
      expect(body).toContain("200.00 USD");
      expect(body).not.toContain("{{");

      const signed = await customer.query(
        `select * from public.sign_rental_agreement($1, '  Casey Customer ', 'en')`,
        [reservationId],
      );
      const row = signed.rows[0];
      expect(row.signed_name).toBe("Casey Customer");
      expect(row.contract_text).toBe(body);
      expect(row.contract_sha256).toBe(createHash("sha256").update(body).digest("hex"));

      // Signing again returns the same record instead of a second signature.
      const again = await customer.query(`select * from public.sign_rental_agreement($1, 'Someone Else', 'en')`, [reservationId]);
      expect(again.rows[0].id).toBe(row.id);
      expect((await status(customer, reservationId))?.agreement_signed).toBe(true);
    });

    it("agreement: no direct inserts, no one else can sign, russian text is available", async () => {
      await expect(
        customer.query(
          `insert into public.rental_agreements (company_id, reservation_id, member_account_id, contract_version, locale, contract_text, contract_sha256, signed_name)
           values ($1, $2, $3, 'x', 'en', 'x', 'x', 'Forged Name')`,
          [companyId, reservationId, customerAccountId],
        ),
      ).rejects.toThrow(/permission denied|row-level security/);
      await expect(stranger.query(`select public.sign_rental_agreement($1, 'Mallory', 'en')`, [reservationId])).rejects.toThrow(/reservation not found/);
      const ru = await customer.query(`select body from public.render_rental_agreement($1, 'ru')`, [reservationId]);
      expect(ru.rows[0].body).toContain("ДОГОВОРА АРЕНДЫ");
    });

    it("agreement: the signed record cannot be edited or deleted by anyone signed in", async () => {
      await expect(owner.query(`update public.rental_agreements set signed_name = 'x' where reservation_id = $1`, [reservationId])).rejects.toThrow(/permission denied/);
      await expect(customer.query(`delete from public.rental_agreements where reservation_id = $1`, [reservationId])).rejects.toThrow(/permission denied/);
    });

    it("deposit: the amount comes from the tariff, and a customer cannot mark it held", async () => {
      const requested = await customer.query(`select * from public.request_deposit($1)`, [reservationId]);
      expect(requested.rows[0]).toMatchObject({ amount_minor: 20000, currency: "USD", status: "pending" });

      const selfHold = await customer.query(`update public.reservation_deposits set status = 'held' where reservation_id = $1`, [reservationId]);
      expect(selfHold.rowCount).toBe(0);
      await expect(
        customer.query(`insert into public.reservation_deposits (reservation_id, company_id, amount_minor, currency, status) values ($1, $2, 1, 'USD', 'held')`, [randomUUID(), companyId]),
      ).rejects.toThrow(/row-level security/);
      expect((await status(customer, reservationId))?.deposit_ok).toBe(false);

      await owner.query(`update public.reservation_deposits set status = 'held' where reservation_id = $1`, [reservationId]);
      expect((await status(customer, reservationId))?.deposit_ok).toBe(true);
    });

    it("deposit: tariffs without one need none", async () => {
      const van = await createReservation(vanId, Date.now() + 80 * 24 * HOUR, Date.now() + 81 * 24 * HOUR);
      await expect(customer.query(`select public.request_deposit($1)`, [van.id])).rejects.toThrow(/no_deposit_required/);
      expect((await status(customer, van.id))).toMatchObject({ deposit_required_minor: 0, deposit_ok: true });
    });

    it("photos: rows without a stored file do not count", async () => {
      // Pickup photos are only accepted once the company has confirmed the reservation.
      await expect(addPickupPhotos(reservationId, carId, false)).rejects.toThrow(/row-level security/);
      await owner.query(`update public.reservations set status = 'confirmed' where id = $1`, [reservationId]);
      await addPickupPhotos(reservationId, carId, false);
      expect((await status(customer, reservationId))).toMatchObject({ photos_present: 0, photos_ok: false });
    });

    it("photos: all five angles with real files, and nothing else, satisfy the check", async () => {
      // Upload files for four of the five recorded angles first.
      const rows = (await customer.query<{ angle: string; storage_path: string }>(
        `select angle, storage_path from public.handover_photos where reservation_id = $1`, [reservationId])).rows;
      for (const row of rows.slice(0, 4)) {
        await admin.query(`insert into storage.objects (bucket_id, name) values ('handover-photos', $1)`, [row.storage_path]);
      }
      expect((await status(customer, reservationId))).toMatchObject({ photos_present: 4, photos_ok: false });
      await admin.query(`insert into storage.objects (bucket_id, name) values ('handover-photos', $1)`, [rows[4]!.storage_path]);
      expect((await status(customer, reservationId))).toMatchObject({ photos_present: 5, photos_ok: true });
    });

    it("unlocking is refused while a check is missing, and reveals no code", async () => {
      // Everything is done except that staff have un-confirmed the booking.
      await owner.query(`update public.reservations set status = 'pending' where id = $1`, [reservationId]);
      expect((await status(customer, reservationId))).toMatchObject({ reservation_confirmed: false, all_ok: false });
      await expect(customer.query(`select * from public.start_contactless_pickup($1)`, [reservationId])).rejects.toThrow(/checks_incomplete/);
      expect((await owner.query(`select count(*)::int as n from public.rentals where reservation_id = $1`, [reservationId])).rows[0].n).toBe(0);
      await owner.query(`update public.reservations set status = 'confirmed' where id = $1`, [reservationId]);
    });

    it("everything is satisfied now, so the customer can unlock", async () => {
      expect((await status(customer, reservationId))).toMatchObject({ all_ok: true, in_pickup_window: true, can_unlock: true });

      const unlocked = await customer.query<{ rental_id: string; keybox_code: string }>(
        `select * from public.start_contactless_pickup($1)`, [reservationId]);
      expect(unlocked.rows[0]!.keybox_code).toBe("4821");

      const rental = (await owner.query(`select * from public.rentals where id = $1`, [unlocked.rows[0]!.rental_id])).rows[0];
      expect(rental).toMatchObject({ status: "active", member_account_id: customerAccountId, odometer_start: 12000, currency: "USD" });
      expect(new Date(rental.expected_return_at).getTime()).toBe(new Date((await owner.query(`select end_at from public.reservations where id = $1`, [reservationId])).rows[0].end_at).getTime());
      // The tariff is rebuilt from the company's tariffs, not copied from anything the customer wrote.
      expect(rental.tariff_snapshot).toMatchObject({ hourlyRateMinor: 1200, dailyRateMinor: 6000, lateFeePerHourMinor: 1500, taxRateBps: 0 });

      expect((await owner.query(`select status from public.vehicles where id = $1`, [carId])).rows[0].status).toBe("rented");
      expect((await owner.query(`select count(*)::int as n from public.handover_photos where rental_id = $1`, [rental.id])).rows[0].n).toBe(5);
      const events = (await owner.query<{ event_type: string }>(`select event_type from public.vehicle_logs where vehicle_id = $1 order by occurred_at`, [carId])).rows.map((r) => r.event_type);
      expect(events).toEqual(expect.arrayContaining(["pickup", "keybox_release"]));
    });

    it("unlocking again re-reveals the code without starting a second rental", async () => {
      const again = await customer.query(`select * from public.start_contactless_pickup($1)`, [reservationId]);
      expect(again.rows[0].keybox_code).toBe("4821");
      expect((await owner.query(`select count(*)::int as n from public.rentals where reservation_id = $1`, [reservationId])).rows[0].n).toBe(1);
    });

    it("someone else's reservation cannot be unlocked, and the code stops working after the rental ends", async () => {
      await expect(stranger.query(`select * from public.start_contactless_pickup($1)`, [reservationId])).rejects.toThrow(/reservation not found/);
      await owner.query(`update public.rentals set status = 'completed', ended_at = now(), odometer_end = 12100 where reservation_id = $1`, [reservationId]);
      await expect(customer.query(`select * from public.start_contactless_pickup($1)`, [reservationId])).rejects.toThrow(/rental_finished/);
    });
  });

  describe("pickup window and vehicle availability", () => {
    it("completing every check early does not unlock before the window opens", async () => {
      const r = await createReservation(vanId, Date.now() + 10 * 24 * HOUR, Date.now() + 11 * 24 * HOUR);
      await completeAllChecks(r.id, vanId);
      expect((await status(customer, r.id))).toMatchObject({ all_ok: true, in_pickup_window: false, can_unlock: false });
      await expect(customer.query(`select * from public.start_contactless_pickup($1)`, [r.id])).rejects.toThrow(/checks_incomplete/);
    });

    it("a vehicle that is not back yet cannot be unlocked", async () => {
      const r = await createReservation(vanId, Date.now() + 1 * HOUR, Date.now() + 25 * HOUR);
      await completeAllChecks(r.id, vanId);
      await owner.query(`update public.vehicles set status = 'service' where id = $1`, [vanId]);
      await expect(customer.query(`select * from public.start_contactless_pickup($1)`, [r.id])).rejects.toThrow(/vehicle_not_available/);
      await owner.query(`update public.vehicles set status = 'available' where id = $1`, [vanId]);
    });

    it("a vehicle with no keybox code is never contactless-ready", async () => {
      const bare = (await owner.query(
        `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'CL-BARE', 'CL-3', 'No Keybox', 'van', 'cargo', 'diesel') returning id`, [companyId])).rows[0].id;
      const r = await createReservation(bare, Date.now() + 1 * HOUR, Date.now() + 5 * HOUR);
      await completeAllChecks(r.id, bare);
      expect((await status(customer, r.id))).toMatchObject({ keybox_configured: false, all_ok: false });
    });
  });

  describe("photo evidence and storage", () => {
    let reservationId: string;

    beforeAll(async () => {
      reservationId = (await createReservation(vanId, Date.now() + 90 * 24 * HOUR, Date.now() + 91 * 24 * HOUR)).id;
      await owner.query(`update public.reservations set status = 'confirmed' where id = $1`, [reservationId]);
    });

    it("rejects paths that are not company/reservation/phase/random.jpg", async () => {
      for (const path of [
        "not-a-path.jpg",
        `${companyId}/${reservationId}/pickup/plate.jpg`,
        `${companyId}/${reservationId}/pickup/${randomUUID()}.png`,
        `${randomUUID()}/${reservationId}/pickup/${randomUUID()}.jpg`,
      ]) {
        await expect(
          customer.query(
            `insert into public.handover_photos (company_id, reservation_id, vehicle_id, phase, angle, storage_path, taken_by_account_id)
             values ($1, $2, $3, 'pickup', 'front', $4, $5)`,
            [companyId, reservationId, vanId, path, customerAccountId],
          ),
        ).rejects.toThrow(/check constraint|row-level security/);
      }
    });

    it("another customer cannot add photos to, or read photos of, this reservation", async () => {
      const path = `${companyId}/${reservationId}/pickup/${randomUUID()}.jpg`;
      await expect(
        stranger.query(
          `insert into public.handover_photos (company_id, reservation_id, vehicle_id, phase, angle, storage_path, taken_by_account_id)
           values ($1, $2, $3, 'pickup', 'front', $4, $5)`,
          [companyId, reservationId, vanId, path, strangerAccountId],
        ),
      ).rejects.toThrow(/row-level security/);

      await customer.query(
        `insert into public.handover_photos (company_id, reservation_id, vehicle_id, phase, angle, storage_path, taken_by_account_id)
         values ($1, $2, $3, 'pickup', 'front', $4, $5)`,
        [companyId, reservationId, vanId, path, customerAccountId],
      );
      expect((await stranger.query(`select * from public.handover_photos where reservation_id = $1`, [reservationId])).rowCount).toBe(0);
      expect((await otherOwner.query(`select * from public.handover_photos`)).rowCount).toBe(0);
      expect((await owner.query(`select * from public.handover_photos where reservation_id = $1`, [reservationId])).rowCount).toBe(1);
    });

    it("photo rows are append-only for signed-in users", async () => {
      await expect(customer.query(`update public.handover_photos set angle = 'rear' where reservation_id = $1`, [reservationId])).rejects.toThrow(/permission denied/);
      await expect(owner.query(`delete from public.handover_photos where reservation_id = $1`, [reservationId])).rejects.toThrow(/permission denied/);
    });

    it("return photos are only accepted during an active rental of that reservation", async () => {
      const path = `${companyId}/${reservationId}/return/${randomUUID()}.jpg`;
      await expect(
        customer.query(
          `insert into public.handover_photos (company_id, reservation_id, vehicle_id, phase, angle, storage_path, taken_by_account_id)
           values ($1, $2, $3, 'return', 'front', $4, $5)`,
          [companyId, reservationId, vanId, path, customerAccountId],
        ),
      ).rejects.toThrow(/row-level security/);
    });

    it("storage: a customer can upload under their own reservation only, and nobody can overwrite", async () => {
      const mine = `${companyId}/${reservationId}/pickup/${randomUUID()}.jpg`;
      await customer.query(`insert into storage.objects (bucket_id, name, owner) values ('handover-photos', $1, null)`, [mine]);

      const theirs = `${companyId}/${reservationId}/pickup/${randomUUID()}.jpg`;
      await expect(stranger.query(`insert into storage.objects (bucket_id, name) values ('handover-photos', $1)`, [theirs])).rejects.toThrow(/row-level security/);
      await expect(customer.query(`insert into storage.objects (bucket_id, name) values ('handover-photos', $1)`, [`${companyId}/${randomUUID()}/pickup/${randomUUID()}.jpg`])).rejects.toThrow(/row-level security/);
      await expect(customer.query(`insert into storage.objects (bucket_id, name) values ('handover-photos', 'free-for-all.jpg')`)).rejects.toThrow(/row-level security/);

      expect((await stranger.query(`select * from storage.objects where bucket_id = 'handover-photos'`)).rowCount).toBe(0);
      expect((await otherOwner.query(`select * from storage.objects where bucket_id = 'handover-photos'`)).rowCount).toBe(0);
      expect((await owner.query(`select * from storage.objects where name = $1`, [mine])).rowCount).toBe(1);
      await expect(customer.query(`update storage.objects set name = name where name = $1`, [mine])).rejects.toThrow(/permission denied/);
    });

    it("the bucket is private and limited to small images", async () => {
      const bucket = (await admin.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'handover-photos'`)).rows[0];
      expect(bucket.public).toBe(false);
      expect(Number(bucket.file_size_limit)).toBeLessThanOrEqual(5 * 1024 * 1024);
      expect(bucket.allowed_mime_types).toEqual(["image/jpeg", "image/png", "image/webp"]);
    });
  });

  describe("public surface", () => {
    it("the booking page can show the deposit before payment", async () => {
      const result = await anon.query(`select * from public.public_tariff_for_vehicle_type('contactless-co', 'car')`);
      expect(result.rows[0]).toMatchObject({ daily_rate_minor: 6000, deposit_minor: 20000 });
    });

    it("anon cannot reach any contactless function", async () => {
      const calls = [
        `select * from public.render_rental_agreement('${randomUUID()}', 'en')`,
        `select * from public.sign_rental_agreement('${randomUUID()}', 'x', 'en')`,
        `select * from public.request_deposit('${randomUUID()}')`,
        `select * from public.start_contactless_pickup('${randomUUID()}')`,
        `select public.can_access_handover_object('a/b/c')`,
      ];
      for (const sql of calls) {
        await expect(anon.query(sql)).rejects.toThrow(/permission denied/);
      }
      await expect(anon.query(`select * from public.contract_templates`)).rejects.toThrow(/permission denied/);
    });

    it("signed-in users cannot read the contract template table directly", async () => {
      await expect(customer.query(`select * from public.contract_templates`)).rejects.toThrow(/permission denied/);
    });
  });
});
