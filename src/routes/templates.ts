import { Hono } from "hono";
import { scopedDb } from "../db/scoped";
import type { AuthedVars } from "../middleware/auth";

export const infoTemplatesRoute = new Hono<{
  Bindings: Env;
  Variables: AuthedVars;
}>();

infoTemplatesRoute.get("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  return c.json({ templates: await db.infoTemplates.list() });
});

infoTemplatesRoute.post("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<Record<string, unknown>>();
  if (typeof body.title !== "string" || !body.title.trim()) {
    return c.json({ error: "title is required" }, 400);
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return c.json({ error: "body is required" }, 400);
  }
  const template = await db.infoTemplates.create({
    title: body.title.trim(),
    body: body.body,
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
  });
  return c.json({ template }, 201);
});

infoTemplatesRoute.patch("/:id", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<Record<string, unknown>>();
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.body === "string") patch.body = body.body;
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;

  const template = await db.infoTemplates.update(c.req.param("id"), patch);
  if (!template) return c.json({ error: "Not found" }, 404);
  return c.json({ template });
});

infoTemplatesRoute.delete("/:id", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const ok = await db.infoTemplates.remove(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});

export const messageTemplatesRoute = new Hono<{
  Bindings: Env;
  Variables: AuthedVars;
}>();

messageTemplatesRoute.get("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  return c.json({ templates: await db.messageTemplates.list() });
});

messageTemplatesRoute.post("/", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<Record<string, unknown>>();
  if (typeof body.title !== "string" || !body.title.trim()) {
    return c.json({ error: "title is required" }, 400);
  }
  if (typeof body.body !== "string" || !body.body.trim()) {
    return c.json({ error: "body is required" }, 400);
  }
  const template = await db.messageTemplates.create({
    title: body.title.trim(),
    channel: body.channel === "email" ? "email" : "sms",
    body: body.body,
    sort_order: typeof body.sort_order === "number" ? body.sort_order : 0,
  });
  return c.json({ template }, 201);
});

messageTemplatesRoute.patch("/:id", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const body = await c.req.json<Record<string, unknown>>();
  const patch: Record<string, unknown> = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.body === "string") patch.body = body.body;
  if (body.channel === "email" || body.channel === "sms") patch.channel = body.channel;
  if (typeof body.sort_order === "number") patch.sort_order = body.sort_order;

  const template = await db.messageTemplates.update(c.req.param("id"), patch);
  if (!template) return c.json({ error: "Not found" }, 404);
  return c.json({ template });
});

messageTemplatesRoute.delete("/:id", async (c) => {
  const db = scopedDb(c.env.DB, c.get("userId"));
  const ok = await db.messageTemplates.remove(c.req.param("id"));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});
