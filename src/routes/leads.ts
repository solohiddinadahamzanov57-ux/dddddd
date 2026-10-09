import { Hono } from "hono";
import { scopedDb } from "../db/scoped";
import { leadCompleteness } from "../lib/completeness";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "../lib/types";
import type { AuthedVars } from "../middleware/auth";

export const leadsRoute = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && LEAD_STATUSES.includes(value as LeadStatus);
}

leadsRoute.get("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const [leads, fields] = await Promise.all([
    db.leads.list(),
    db.customFields.list(),
  ]);

  const status = c.req.query("status");
  const due = c.req.query("due");
  const q = c.req.query("q")?.trim().toLowerCase();

  let filtered: Lead[] = leads;
  if (status && isLeadStatus(status)) {
    filtered = filtered.filter((l) => l.status === status);
  }
  if (due === "today") {
    const endOfToday = new Date();
    endOfToday.setUTCHours(23, 59, 59, 999);
    filtered = filtered.filter(
      (l) => l.next_follow_up_at && l.next_follow_up_at <= endOfToday.toISOString(),
    );
  }
  if (q) {
    filtered = filtered.filter((l) =>
      [l.name, l.phone, l.email, l.company, l.notes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }

  const withCompleteness = filtered.map((lead) => ({
    ...lead,
    completeness: leadCompleteness(lead, fields),
  }));

  return c.json({ leads: withCompleteness, customFields: fields });
});

leadsRoute.post("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<Record<string, unknown>>();

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return c.json({ error: "name is required" }, 400);
  }

  const lead = await db.leads.create({
    name: body.name.trim(),
    phone: asStringOrNull(body.phone),
    email: asStringOrNull(body.email),
    company: asStringOrNull(body.company),
    status: isLeadStatus(body.status) ? body.status : "new",
    source: asStringOrNull(body.source),
    notes: asStringOrNull(body.notes),
    custom_data:
      typeof body.custom_data === "object" && body.custom_data !== null
        ? (body.custom_data as Record<string, unknown>)
        : undefined,
    next_follow_up_at: asStringOrNull(body.next_follow_up_at),
  });

  return c.json({ lead }, 201);
});

leadsRoute.get("/:id", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const lead = await db.leads.get(c.req.param("id"));
  if (!lead) return c.json({ error: "Not found" }, 404);
  const calls = await db.callLogs.listForLead(lead.id);
  return c.json({ lead, calls });
});

leadsRoute.patch("/:id", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<Record<string, unknown>>();

  const patch: Record<string, unknown> = {};
  for (const key of [
    "name",
    "phone",
    "email",
    "company",
    "source",
    "notes",
    "next_follow_up_at",
    "last_contacted_at",
  ] as const) {
    if (key in body) patch[key] = asStringOrNull(body[key]);
  }
  if ("status" in body && isLeadStatus(body.status)) patch.status = body.status;
  if ("custom_data" in body && typeof body.custom_data === "object" && body.custom_data !== null) {
    patch.custom_data = JSON.stringify(body.custom_data);
  }

  const lead = await db.leads.update(c.req.param("id"), patch);
  if (!lead) return c.json({ error: "Not found" }, 404);
  return c.json({ lead });
});

leadsRoute.delete("/:id", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const ok = await db.leads.remove(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

leadsRoute.get("/:id/calls", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const lead = await db.leads.get(c.req.param("id"));
  if (!lead) return c.json({ error: "Not found" }, 404);
  const calls = await db.callLogs.listForLead(lead.id);
  return c.json({ calls });
});

leadsRoute.post("/:id/calls", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const leadId = c.req.param("id");
  const lead = await db.leads.get(leadId);
  if (!lead) return c.json({ error: "Not found" }, 404);

  const body = await c.req.json<Record<string, unknown>>();
  const call = await db.callLogs.create({
    lead_id: leadId,
    direction: body.direction === "inbound" ? "inbound" : "outbound",
    outcome: asStringOrNull(body.outcome),
    note: asStringOrNull(body.note),
  });
  return c.json({ call }, 201);
});

function asStringOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
