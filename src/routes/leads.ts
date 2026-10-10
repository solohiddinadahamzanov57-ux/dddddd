import { Hono } from "hono";
import { scopedDb } from "../db/scoped";
import { leadCompleteness } from "../lib/completeness";
import { normalizeImportedLead } from "../lib/normalize";
import {
  DOCUMENT_KINDS,
  LEAD_STATUSES,
  type DocumentKind,
  type Lead,
  type LeadStatus,
} from "../lib/types";
import type { AuthedVars } from "../middleware/auth";

export const leadsRoute = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

function isLeadStatus(value: unknown): value is LeadStatus {
  return typeof value === "string" && LEAD_STATUSES.includes(value as LeadStatus);
}

leadsRoute.get("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const [leads, fields, docs] = await Promise.all([
    db.leads.list(),
    db.customFields.list(),
    db.documents.listAllMeta(),
  ]);

  // Per-lead document counts by kind, for the CDL / Med badges on cards.
  const docCounts: Record<string, Record<string, number>> = {};
  for (const d of docs) {
    const byKind = (docCounts[d.lead_id] ??= {});
    byKind[d.kind] = (byKind[d.kind] ?? 0) + 1;
  }

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
      [l.name, l.phone, l.email, l.company, l.state, l.cdl, l.notes]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }

  const withCompleteness = filtered.map((lead) => ({
    ...lead,
    completeness: leadCompleteness(lead, fields),
    documents: docCounts[lead.id] ?? {},
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
    state: asStringOrNull(body.state),
    cdl: asStringOrNull(body.cdl),
    medical_card: asStringOrNull(body.medical_card),
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

// Bulk insert from the importer. The browser sends reviewed rows in chunks.
const IMPORT_MAX = 100;
leadsRoute.post("/import", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<{ leads?: unknown; source?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  if (!Array.isArray(body.leads)) return c.json({ error: "leads must be an array" }, 400);
  if (body.leads.length > IMPORT_MAX) {
    return c.json({ error: `Send at most ${IMPORT_MAX} leads per request` }, 413);
  }
  const source = asStringOrNull(body.source) ?? "Import";

  const cleaned = [];
  for (const raw of body.leads) {
    if (!raw || typeof raw !== "object") continue;
    const lead = normalizeImportedLead(raw as Record<string, unknown>);
    if (lead) cleaned.push({ ...lead, source, status: "new" as const });
  }
  const created = await db.leads.createMany(cleaned);
  return c.json({ imported: created.length, skipped: body.leads.length - created.length }, 201);
});

// ---------- Documents (CDL / medical card photos) ----------

const MAX_DOC_BASE64 = 1_900_000; // keeps each D1 row under its 2 MB limit
const ALLOWED_DOC_TYPES = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;

function isDocumentKind(value: unknown): value is DocumentKind {
  return typeof value === "string" && DOCUMENT_KINDS.includes(value as DocumentKind);
}

leadsRoute.get("/:id/documents", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const lead = await db.leads.get(c.req.param("id"));
  if (!lead) return c.json({ error: "Not found" }, 404);
  return c.json({ documents: await db.documents.listForLead(lead.id) });
});

leadsRoute.post("/:id/documents", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
  const mime = typeof body.mime_type === "string" ? body.mime_type : "";
  const data = typeof body.data === "string" ? body.data.replace(/^data:[^,]*,/, "") : "";

  if (!ALLOWED_DOC_TYPES.test(mime)) return c.json({ error: "Only photos or PDFs can be attached." }, 400);
  if (!data || !/^[A-Za-z0-9+/=]+$/.test(data)) return c.json({ error: "File data missing." }, 400);
  if (data.length > MAX_DOC_BASE64) return c.json({ error: "File too large (max about 1.4 MB)." }, 413);

  const doc = await db.documents.create({
    lead_id: c.req.param("id"),
    kind: isDocumentKind(body.kind) ? body.kind : "other",
    file_name: asStringOrNull(body.file_name)?.slice(0, 200) ?? null,
    mime_type: mime,
    size: Math.floor((data.length * 3) / 4),
    data,
  });
  if (!doc) return c.json({ error: "Not found" }, 404);
  return c.json({ document: doc }, 201);
});

leadsRoute.get("/:id/documents/:docId", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const doc = await db.documents.get(c.req.param("id"), c.req.param("docId"));
  if (!doc) return c.json({ error: "Not found" }, 404);
  const bytes = Uint8Array.from(atob(doc.data), (ch) => ch.charCodeAt(0));
  const filename = (doc.file_name ?? `${doc.kind}`).replace(/[^\w.\- ]/g, "_");
  return new Response(bytes, {
    headers: {
      "Content-Type": doc.mime_type,
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

leadsRoute.delete("/:id/documents/:docId", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const ok = await db.documents.remove(c.req.param("id"), c.req.param("docId"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
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
    "state",
    "cdl",
    "medical_card",
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
