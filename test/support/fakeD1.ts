import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * A minimal stand-in for Cloudflare's D1Database, backed by real SQLite
 * (better-sqlite3) instead of workerd. D1 *is* SQLite under the hood, so
 * this runs the exact same SQL our scoped db helper issues — it just does
 * it without needing the Workers runtime, which keeps these tests fast and
 * dependency-light. Implements only the subset of the D1 API this project
 * actually calls: prepare().bind().all()/first()/run().
 */
export function createFakeD1(): D1Database {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const migrationsDir = join(import.meta.dirname, "../../migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    sqlite.exec(readFileSync(join(migrationsDir, file), "utf8"));
  }

  const fake = {
    async batch(statements: Array<{ run: () => Promise<unknown> }>) {
      const results = [];
      for (const stmt of statements) results.push(await stmt.run());
      return results;
    },
    prepare(sql: string) {
      const stmt = sqlite.prepare(sql);
      let boundArgs: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          boundArgs = args;
          return this;
        },
        async all<T>() {
          const results = stmt.all(...boundArgs) as T[];
          return { results };
        },
        async first<T>() {
          const row = stmt.get(...boundArgs) as T | undefined;
          return row ?? null;
        },
        async run() {
          const info = stmt.run(...boundArgs);
          return { meta: { changes: info.changes } };
        },
      };
    },
  };

  return fake as unknown as D1Database;
}
