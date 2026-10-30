// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  applySeed,
  connectAsAdmin,
  createTestDatabase,
  dropTestDatabase,
  isPostgresAvailable,
} from "./setup";

const pgAvailable = await isPostgresAvailable();

describe.skipIf(!pgAvailable)("supabase/seed.sql", () => {
  let dbName: string;

  beforeAll(async () => {
    dbName = await createTestDatabase();
    await applySeed(dbName);
  }, 30_000);

  afterAll(async () => {
    if (dbName) await dropTestDatabase(dbName);
  });

  it("creates one demo company with 12 vehicles covering every type and status", async () => {
    const admin = await connectAsAdmin(dbName);

    const vehicles = await admin.query<{ type: string; status: string; fuel_type: string }>(
      `select type, status, fuel_type from public.vehicles`,
    );
    expect(vehicles.rowCount).toBe(12);
    expect(new Set(vehicles.rows.map((v) => v.type)).size).toBe(5);
    expect(new Set(vehicles.rows.map((v) => v.status)).size).toBe(3);
    expect(vehicles.rows.some((v) => v.fuel_type === "electric")).toBe(true);

    const owner = await admin.query(`select role from public.accounts where role = 'owner'`);
    expect(owner.rowCount).toBe(1);

    await admin.end();
  });
});
