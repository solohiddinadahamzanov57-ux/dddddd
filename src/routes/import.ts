import { Hono } from "hono";
import { normalizeImportedLead, type ImportedLead } from "../lib/normalize";
import type { AuthedVars } from "../middleware/auth";

/**
 * POST /api/import/extract — the "smart" half of the lead importer.
 *
 * Spreadsheets are parsed in the browser (columns are matched there, no AI
 * needed). Everything messy — Word text, PDF text, photos/scans of lists,
 * pasted text — is sent here and read by Workers AI (free daily allowance on
 * the Workers Free plan), which figures out which part is the name, phone,
 * state, email, CDL and medical card info.
 *
 * Body: { text?: string } or { image?: "data:image/jpeg;base64,..." }
 * Reply: { leads: ImportedLead[] }
 */
export const importRoute = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";
const MAX_TEXT = 16_000; // the browser splits bigger documents into chunks
const MAX_IMAGE = 5_000_000; // data URL length (~3.7 MB image)

const SYSTEM_PROMPT = `You read messy documents for a truck driver recruiter and pull out every driver lead (person) in them.

Return ONLY JSON shaped like:
{"leads":[{"name":"","phone":"","email":"","state":"","cdl":"","medical_card":"","notes":""}]}

Rules:
- One object per person. Keep the order they appear in.
- name: the person's full name (first + last). Not a company, not a column header.
- phone: the person's phone number exactly as written.
- email: the person's email address (often gmail).
- state: the US state the person lives in, as a 2-letter code (TX, CA...). Infer it from a city/address or area-code ONLY if the document clearly says it; otherwise "".
- cdl: CDL class, endorsements, or CDL experience if mentioned (e.g. "Class A, 3 yrs, Hazmat").
- medical_card: medical card / DOT physical status or expiration if mentioned.
- notes: other useful facts about this person in a few words (city, experience, availability, etc.), else "".
- Use "" (empty string) for anything missing. Never invent data. Skip headers, totals, logos, and the recruiter's or company's own contact info.
- If there are no people, return {"leads":[]}.`;

const LEADS_SCHEMA = {
  type: "object",
  properties: {
    leads: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          phone: { type: "string" },
          email: { type: "string" },
          state: { type: "string" },
          cdl: { type: "string" },
          medical_card: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name", "phone", "email", "state", "cdl", "medical_card", "notes"],
      },
    },
  },
  required: ["leads"],
};

importRoute.post("/extract", async (c) => {
  if (!c.env.AI) {
    return c.json({ error: "Smart import isn't set up on the server (missing AI binding)." }, 503);
  }

  const body = await c.req.json<{ text?: unknown; image?: unknown }>().catch(() => ({}) as Record<string, unknown>);
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const image = typeof body.image === "string" ? body.image : "";

  if (!text && !image) return c.json({ error: "Send text or an image." }, 400);
  if (text.length > MAX_TEXT) return c.json({ error: "Text chunk too large." }, 413);
  if (image) {
    if (!/^data:image\/(png|jpe?g|webp|gif);base64,/.test(image)) {
      return c.json({ error: "Image must be a PNG, JPG, WEBP or GIF." }, 400);
    }
    if (image.length > MAX_IMAGE) return c.json({ error: "Image too large." }, 413);
  }

  const userContent = image
    ? [
        { type: "text", text: "Extract every driver lead from this image (a photo, scan, or screenshot of a list, form, or document)." },
        { type: "image_url", image_url: { url: image } },
      ]
    : `Extract every driver lead from this document text:\n\n"""\n${text}\n"""`;

  let raw: unknown;
  try {
    const result = await c.env.AI.run(MODEL, {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
      response_format: { type: "json_schema", json_schema: LEADS_SCHEMA },
      max_tokens: 6000,
      temperature: 0,
    } as never);
    raw = (result as { response?: unknown }).response ?? result;
  } catch (err) {
    console.error("AI extract failed", err);
    const msg = err instanceof Error ? err.message : String(err);
    if (/limit|quota|neuron|429/i.test(msg)) {
      return c.json({ error: "Today's free AI allowance is used up. Spreadsheets still import fine; try files/photos again tomorrow." }, 429);
    }
    return c.json({ error: "The AI couldn't read this file. Try a clearer photo, or a spreadsheet." }, 502);
  }

  const leads = parseLeads(raw);
  return c.json({ leads });
});

/** Accepts the model's reply as an object or a string (possibly wrapped in prose / code fences). */
export function parseLeads(raw: unknown): ImportedLead[] {
  let data: unknown = raw;
  if (typeof raw === "string") {
    data = tryJson(raw);
    if (data === undefined) {
      const obj = raw.match(/\{[\s\S]*\}/);
      const arr = raw.match(/\[[\s\S]*\]/);
      data = (obj && tryJson(obj[0])) ?? (arr && tryJson(arr[0])) ?? undefined;
    }
  }
  const list = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { leads?: unknown }).leads)
      ? (data as { leads: unknown[] }).leads
      : [];
  const out: ImportedLead[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const lead = normalizeImportedLead(item as Record<string, unknown>);
    if (lead) out.push(lead);
  }
  return out;
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
}
