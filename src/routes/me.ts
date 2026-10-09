import { Hono } from "hono";
import { scopedDb } from "../db/scoped";
import { fleetCompleteness } from "../lib/completeness";
import { LEAD_STATUSES } from "../lib/types";
import type { AuthedVars } from "../middleware/auth";

export const meRoute = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

meRoute.get("/", async (c) => {
  return c.json({ id: c.get("userId"), email: c.get("userEmail") });
});

meRoute.get("/summary", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const [leads, fields, dueToday] = await Promise.all([
    db.leads.list(),
    db.customFields.list(),
    db.leads.dueToday(),
  ]);

  const byStatus: Record<string, number> = {};
  for (const status of LEAD_STATUSES) byStatus[status] = 0;
  for (const lead of leads) byStatus[lead.status] = (byStatus[lead.status] ?? 0) + 1;

  return c.json({
    totalLeads: leads.length,
    dueTodayCount: dueToday.length,
    byStatus,
    completeness: fleetCompleteness(leads, fields),
  });
});
