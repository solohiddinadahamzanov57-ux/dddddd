import { Hono } from "hono";
import { scopedDb } from "../db/scoped";
import type { AuthedVars } from "../middleware/auth";

export const fieldsRoute = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

fieldsRoute.get("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  return c.json({ customFields: await db.customFields.list() });
});

fieldsRoute.post("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<Record<string, unknown>>();

  if (typeof body.field_key !== "string" || !body.field_key.trim()) {
    return c.json({ error: "field_key is required" }, 400);
  }
  if (typeof body.label !== "string" || !body.label.trim()) {
    return c.json({ error: "label is required" }, 400);
  }

  const field = await db.customFields.create({
    field_key: body.field_key.trim(),
    label: body.label.trim(),
    field_type:
      body.field_type === "number" ||
      body.field_type === "date" ||
      body.field_type === "select"
        ? body.field_type
        : "text",
    options: Array.isArray(body.options) ? body.options.map(String) : null,
    required: Boolean(body.required),
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
  });

  return c.json({ field }, 201);
});

fieldsRoute.delete("/:id", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const ok = await db.customFields.remove(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
