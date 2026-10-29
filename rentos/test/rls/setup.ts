import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { Client } from "pg";

const ADMIN_CONNECTION = {
  host: process.env.PG_TEST_HOST ?? "127.0.0.1",
  port: Number(process.env.PG_TEST_PORT ?? 5432),
  user: process.env.PG_TEST_USER ?? "postgres",
  password: process.env.PG_TEST_PASSWORD ?? "postgres",
};

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");
const AUTH_SHIM_PATH = path.resolve(__dirname, "./auth-shim.sql");
const SEED_PATH = path.resolve(__dirname, "../../supabase/seed.sql");

async function withAdminClient<T>(
  database: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ ...ADMIN_CONNECTION, database });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Creates a throwaway database, applies the auth shim, then every migration in order. */
export async function createTestDatabase(): Promise<string> {
  const dbName = `rentos_rls_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  await withAdminClient("postgres", async (client) => {
    await client.query(`create database ${dbName}`);
  });

  try {
    await withAdminClient(dbName, async (client) => {
      const authShim = await readFile(AUTH_SHIM_PATH, "utf8");
      await client.query(authShim);

      const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
      for (const file of files) {
        const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
        try {
          await client.query(sql);
        } catch (error) {
          throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
        }
      }
    });
  } catch (error) {
    await dropTestDatabase(dbName);
    throw error;
  }

  return dbName;
}

export async function dropTestDatabase(dbName: string): Promise<void> {
  await withAdminClient("postgres", async (client) => {
    await client.query(`drop database if exists ${dbName} with (force)`);
  });
}

/** A client authenticated as a specific user, the way PostgREST would set one up for a request. */
export async function connectAs(dbName: string, userId: string | null): Promise<Client> {
  const client = new Client({ ...ADMIN_CONNECTION, database: dbName });
  await client.connect();
  if (userId === null) {
    await client.query(`set role anon`);
  } else {
    await client.query(`set role authenticated`);
    await client.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: userId, role: "authenticated" }),
    ]);
  }
  return client;
}

export async function applySeed(dbName: string): Promise<void> {
  await withAdminClient(dbName, async (client) => {
    const seed = await readFile(SEED_PATH, "utf8");
    await client.query(seed);
  });
}

export async function connectAsAdmin(dbName: string): Promise<Client> {
  const client = new Client({ ...ADMIN_CONNECTION, database: dbName });
  await client.connect();
  return client;
}

/** Used to skip the RLS suite gracefully when no local Postgres is reachable. */
export async function isPostgresAvailable(): Promise<boolean> {
  const client = new Client({
    ...ADMIN_CONNECTION,
    database: "postgres",
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}
