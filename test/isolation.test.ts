import { beforeEach, describe, expect, it } from "vitest";
import { scopedDb } from "../src/db/scoped";
import { createFakeD1 } from "./support/fakeD1";

let db: D1Database;

beforeEach(() => {
  db = createFakeD1();
});

async function makeUser(id: string, email: string) {
  const ts = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .bind(id, email, email, ts, ts)
    .run();
}

describe("scopedDb user isolation", () => {
  it("rejects construction without a userId", () => {
    expect(() => scopedDb(db, "")).toThrow();
    // @ts-expect-error intentionally wrong type to prove the guard
    expect(() => scopedDb(db, undefined)).toThrow();
  });

  it("never lets user A read user B's leads", async () => {
    await makeUser("user-a", "a@example.com");
    await makeUser("user-b", "b@example.com");

    const dbA = scopedDb(db, "user-a");
    const dbB = scopedDb(db, "user-b");

    const leadA = await dbA.leads.create({ name: "Driver A" });
    const leadB = await dbB.leads.create({ name: "Driver B" });

    const listA = await dbA.leads.list();
    const listB = await dbB.leads.list();

    expect(listA.map((l) => l.id)).toEqual([leadA.id]);
    expect(listB.map((l) => l.id)).toEqual([leadB.id]);

    // A can't fetch B's lead by id, even knowing the exact id.
    expect(await dbA.leads.get(leadB.id)).toBeNull();
    expect(await dbB.leads.get(leadA.id)).toBeNull();
  });

  it("never lets user A update or delete user B's lead by guessing the id", async () => {
    await makeUser("user-c", "c@example.com");
    await makeUser("user-d", "d@example.com");

    const dbC = scopedDb(db, "user-c");
    const dbD = scopedDb(db, "user-d");

    const leadD = await dbD.leads.create({ name: "Driver D", phone: "555-0001" });

    // C tries to update D's lead using D's real id.
    const updateResult = await dbC.leads.update(leadD.id, { name: "Hijacked" });
    expect(updateResult).toBeNull();

    const stillD = await dbD.leads.get(leadD.id);
    expect(stillD?.name).toBe("Driver D");

    // C tries to delete D's lead using D's real id.
    const deleted = await dbC.leads.remove(leadD.id);
    expect(deleted).toBe(false);

    const stillThere = await dbD.leads.get(leadD.id);
    expect(stillThere).not.toBeNull();
  });

  it("isolates custom fields, templates, and call logs the same way", async () => {
    await makeUser("user-e", "e@example.com");
    await makeUser("user-f", "f@example.com");

    const dbE = scopedDb(db, "user-e");
    const dbF = scopedDb(db, "user-f");

    await dbE.customFields.create({ field_key: "cdl_class", label: "CDL Class" });
    await dbE.infoTemplates.create({ title: "Pitch", body: "Hello" });
    await dbE.messageTemplates.create({ title: "Follow up", body: "Hi {name}" });
    const leadE = await dbE.leads.create({ name: "Driver E" });
    await dbE.callLogs.create({ lead_id: leadE.id, outcome: "connected" });

    expect(await dbF.customFields.list()).toEqual([]);
    expect(await dbF.infoTemplates.list()).toEqual([]);
    expect(await dbF.messageTemplates.list()).toEqual([]);
    expect(await dbF.callLogs.listForLead(leadE.id)).toEqual([]);

    expect(await dbE.customFields.list()).toHaveLength(1);
    expect(await dbE.infoTemplates.list()).toHaveLength(1);
    expect(await dbE.messageTemplates.list()).toHaveLength(1);
    expect(await dbE.callLogs.listForLead(leadE.id)).toHaveLength(1);
  });
});
