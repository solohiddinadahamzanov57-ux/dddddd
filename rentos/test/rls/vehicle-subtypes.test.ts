// @vitest-environment node
import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { VEHICLE_SUBTYPES, VEHICLE_TYPES } from "../../src/lib/vehicles/types";
import {
  connectAs,
  connectAsAdmin,
  createTestDatabase,
  dropTestDatabase,
  isPostgresAvailable,
} from "./setup";

const pgAvailable = await isPostgresAvailable();

/**
 * src/lib/vehicles/types.ts is a hand-maintained mirror of the DB's
 * type->subtype CHECK constraint (vehicles_subtype_matches_type). This test
 * is the thing that actually keeps them honest: every pair the TS module
 * calls valid must insert, and a couple of invalid pairs must be rejected.
 */
describe.skipIf(!pgAvailable)(
  "vehicle type/subtype source of truth matches the DB constraint",
  () => {
    let dbName: string;
    let owner: Client;
    let companyId: string;

    beforeAll(async () => {
      dbName = await createTestDatabase();
      const admin = await connectAsAdmin(dbName);
      const inserted = await admin.query<{ id: string }>(
        `insert into auth.users (email) values ('owner-subtypes@example.com') returning id`,
      );
      const userId = inserted.rows[0]!.id;
      await admin.end();

      owner = await connectAs(dbName, userId);
      const company = (
        await owner.query(`select * from public.create_company('Subtype Co', 'subtype-co', 'USD')`)
      ).rows[0] as { id: string };
      companyId = company.id;
    }, 30_000);

    afterAll(async () => {
      await owner?.end();
      if (dbName) await dropTestDatabase(dbName);
    });

    for (const type of VEHICLE_TYPES) {
      for (const subtype of VEHICLE_SUBTYPES[type]) {
        it(`accepts (${type}, ${subtype})`, async () => {
          await expect(
            owner.query(
              `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
             values ($1, $2, 'X-1', 'Demo', $3, $4, 'gasoline')`,
              [companyId, `BC-${type}-${subtype}`, type, subtype],
            ),
          ).resolves.toBeDefined();
        });
      }
    }

    it("rejects a subtype that belongs to a different type", async () => {
      await expect(
        owner.query(
          `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-bad-1', 'X-1', 'Demo', 'car', 'pickup', 'gasoline')`,
          [companyId],
        ),
      ).rejects.toThrow();
    });

    it("rejects a subtype that doesn't exist at all", async () => {
      await expect(
        owner.query(
          `insert into public.vehicles (company_id, barcode, license_plate, model, type, subtype, fuel_type)
         values ($1, 'BC-bad-2', 'X-1', 'Demo', 'car', 'convertible', 'gasoline')`,
          [companyId],
        ),
      ).rejects.toThrow();
    });
  },
);
