import type {
  CallLog,
  CustomField,
  InfoTemplate,
  Lead,
  LeadStatus,
  MessageTemplate,
} from "../lib/types";

/**
 * The only way the rest of the app is allowed to touch leads, custom_fields,
 * info_templates, message_templates, or call_logs. D1 has no row-level
 * security, so every statement here hard-codes `user_id = ?` bound to the
 * userId this client was built with — there is no method that takes a
 * caller-supplied userId, so a route can't accidentally pass the wrong one.
 */
export function scopedDb(db: D1Database, userId: string) {
  if (!userId || typeof userId !== "string") {
    throw new Error("scopedDb requires a non-empty userId");
  }

  const now = () => new Date().toISOString();
  const newId = () => crypto.randomUUID();

  const getLead = async (id: string): Promise<Lead | null> => {
    const row = await db
      .prepare(`SELECT * FROM leads WHERE user_id = ? AND id = ?`)
      .bind(userId, id)
      .first<Lead>();
    return row ?? null;
  };

  return {
    leads: {
      async list(): Promise<Lead[]> {
        const { results } = await db
          .prepare(
            `SELECT * FROM leads WHERE user_id = ? ORDER BY created_at DESC`,
          )
          .bind(userId)
          .all<Lead>();
        return results;
      },

      get: getLead,

      async create(input: {
        name: string;
        phone?: string | null;
        email?: string | null;
        company?: string | null;
        status?: LeadStatus;
        source?: string | null;
        notes?: string | null;
        custom_data?: Record<string, unknown>;
        next_follow_up_at?: string | null;
      }): Promise<Lead> {
        const id = newId();
        const ts = now();
        const lead: Lead = {
          id,
          user_id: userId,
          name: input.name,
          phone: input.phone ?? null,
          email: input.email ?? null,
          company: input.company ?? null,
          status: input.status ?? "new",
          source: input.source ?? null,
          notes: input.notes ?? null,
          custom_data: JSON.stringify(input.custom_data ?? {}),
          next_follow_up_at: input.next_follow_up_at ?? null,
          last_contacted_at: null,
          created_at: ts,
          updated_at: ts,
        };
        await db
          .prepare(
            `INSERT INTO leads
              (id, user_id, name, phone, email, company, status, source, notes, custom_data, next_follow_up_at, last_contacted_at, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            lead.id,
            lead.user_id,
            lead.name,
            lead.phone,
            lead.email,
            lead.company,
            lead.status,
            lead.source,
            lead.notes,
            lead.custom_data,
            lead.next_follow_up_at,
            lead.last_contacted_at,
            lead.created_at,
            lead.updated_at,
          )
          .run();
        return lead;
      },

      /** Returns the updated row, or null if it doesn't exist or isn't this user's. */
      async update(
        id: string,
        patch: Partial<
          Pick<
            Lead,
            | "name"
            | "phone"
            | "email"
            | "company"
            | "status"
            | "source"
            | "notes"
            | "custom_data"
            | "next_follow_up_at"
            | "last_contacted_at"
          >
        >,
      ): Promise<Lead | null> {
        const existing = await getLead(id);
        if (!existing) return null;

        const fields = Object.keys(patch) as Array<keyof typeof patch>;
        if (fields.length === 0) return existing;

        const setClause = fields.map((f) => `${f} = ?`).join(", ");
        const values = fields.map((f) => patch[f]);
        const ts = now();

        await db
          .prepare(
            `UPDATE leads SET ${setClause}, updated_at = ? WHERE user_id = ? AND id = ?`,
          )
          .bind(...values, ts, userId, id)
          .run();

        return getLead(id);
      },

      /** Returns true if a row was actually deleted. */
      async remove(id: string): Promise<boolean> {
        const result = await db
          .prepare(`DELETE FROM leads WHERE user_id = ? AND id = ?`)
          .bind(userId, id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      },

      async dueToday(): Promise<Lead[]> {
        const todayEnd = new Date();
        todayEnd.setUTCHours(23, 59, 59, 999);
        const { results } = await db
          .prepare(
            `SELECT * FROM leads
             WHERE user_id = ? AND next_follow_up_at IS NOT NULL AND next_follow_up_at <= ?
             ORDER BY next_follow_up_at ASC`,
          )
          .bind(userId, todayEnd.toISOString())
          .all<Lead>();
        return results;
      },
    },

    customFields: {
      async list(): Promise<CustomField[]> {
        const { results } = await db
          .prepare(
            `SELECT * FROM custom_fields WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC`,
          )
          .bind(userId)
          .all<CustomField>();
        return results;
      },

      async create(input: {
        field_key: string;
        label: string;
        field_type?: CustomField["field_type"];
        options?: string[] | null;
        required?: boolean;
        sort_order?: number;
      }): Promise<CustomField> {
        const field: CustomField = {
          id: newId(),
          user_id: userId,
          field_key: input.field_key,
          label: input.label,
          field_type: input.field_type ?? "text",
          options: input.options ? JSON.stringify(input.options) : null,
          required: input.required ? 1 : 0,
          sort_order: input.sort_order ?? 0,
          created_at: now(),
        };
        await db
          .prepare(
            `INSERT INTO custom_fields
              (id, user_id, field_key, label, field_type, options, required, sort_order, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            field.id,
            field.user_id,
            field.field_key,
            field.label,
            field.field_type,
            field.options,
            field.required,
            field.sort_order,
            field.created_at,
          )
          .run();
        return field;
      },

      async remove(id: string): Promise<boolean> {
        const result = await db
          .prepare(`DELETE FROM custom_fields WHERE user_id = ? AND id = ?`)
          .bind(userId, id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      },
    },

    infoTemplates: {
      async list(): Promise<InfoTemplate[]> {
        const { results } = await db
          .prepare(
            `SELECT * FROM info_templates WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC`,
          )
          .bind(userId)
          .all<InfoTemplate>();
        return results;
      },

      async create(input: {
        title: string;
        body: string;
        sort_order?: number;
      }): Promise<InfoTemplate> {
        const ts = now();
        const tpl: InfoTemplate = {
          id: newId(),
          user_id: userId,
          title: input.title,
          body: input.body,
          sort_order: input.sort_order ?? 0,
          created_at: ts,
          updated_at: ts,
        };
        await db
          .prepare(
            `INSERT INTO info_templates (id, user_id, title, body, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            tpl.id,
            tpl.user_id,
            tpl.title,
            tpl.body,
            tpl.sort_order,
            tpl.created_at,
            tpl.updated_at,
          )
          .run();
        return tpl;
      },

      async update(
        id: string,
        patch: Partial<Pick<InfoTemplate, "title" | "body" | "sort_order">>,
      ): Promise<InfoTemplate | null> {
        const fields = Object.keys(patch) as Array<keyof typeof patch>;
        if (fields.length === 0) {
          const row = await db
            .prepare(`SELECT * FROM info_templates WHERE user_id = ? AND id = ?`)
            .bind(userId, id)
            .first<InfoTemplate>();
          return row ?? null;
        }
        const setClause = fields.map((f) => `${f} = ?`).join(", ");
        const values = fields.map((f) => patch[f]);
        await db
          .prepare(
            `UPDATE info_templates SET ${setClause}, updated_at = ? WHERE user_id = ? AND id = ?`,
          )
          .bind(...values, now(), userId, id)
          .run();
        const row = await db
          .prepare(`SELECT * FROM info_templates WHERE user_id = ? AND id = ?`)
          .bind(userId, id)
          .first<InfoTemplate>();
        return row ?? null;
      },

      async remove(id: string): Promise<boolean> {
        const result = await db
          .prepare(`DELETE FROM info_templates WHERE user_id = ? AND id = ?`)
          .bind(userId, id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      },
    },

    messageTemplates: {
      async list(): Promise<MessageTemplate[]> {
        const { results } = await db
          .prepare(
            `SELECT * FROM message_templates WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC`,
          )
          .bind(userId)
          .all<MessageTemplate>();
        return results;
      },

      async create(input: {
        title: string;
        channel?: MessageTemplate["channel"];
        body: string;
        sort_order?: number;
      }): Promise<MessageTemplate> {
        const ts = now();
        const tpl: MessageTemplate = {
          id: newId(),
          user_id: userId,
          title: input.title,
          channel: input.channel ?? "sms",
          body: input.body,
          sort_order: input.sort_order ?? 0,
          created_at: ts,
          updated_at: ts,
        };
        await db
          .prepare(
            `INSERT INTO message_templates (id, user_id, title, channel, body, sort_order, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            tpl.id,
            tpl.user_id,
            tpl.title,
            tpl.channel,
            tpl.body,
            tpl.sort_order,
            tpl.created_at,
            tpl.updated_at,
          )
          .run();
        return tpl;
      },

      async update(
        id: string,
        patch: Partial<
          Pick<MessageTemplate, "title" | "channel" | "body" | "sort_order">
        >,
      ): Promise<MessageTemplate | null> {
        const fields = Object.keys(patch) as Array<keyof typeof patch>;
        if (fields.length > 0) {
          const setClause = fields.map((f) => `${f} = ?`).join(", ");
          const values = fields.map((f) => patch[f]);
          await db
            .prepare(
              `UPDATE message_templates SET ${setClause}, updated_at = ? WHERE user_id = ? AND id = ?`,
            )
            .bind(...values, now(), userId, id)
            .run();
        }
        const row = await db
          .prepare(`SELECT * FROM message_templates WHERE user_id = ? AND id = ?`)
          .bind(userId, id)
          .first<MessageTemplate>();
        return row ?? null;
      },

      async remove(id: string): Promise<boolean> {
        const result = await db
          .prepare(`DELETE FROM message_templates WHERE user_id = ? AND id = ?`)
          .bind(userId, id)
          .run();
        return (result.meta?.changes ?? 0) > 0;
      },
    },

    callLogs: {
      async listForLead(leadId: string): Promise<CallLog[]> {
        const { results } = await db
          .prepare(
            `SELECT * FROM call_logs WHERE user_id = ? AND lead_id = ? ORDER BY created_at DESC`,
          )
          .bind(userId, leadId)
          .all<CallLog>();
        return results;
      },

      async create(input: {
        lead_id: string;
        direction?: CallLog["direction"];
        outcome?: string | null;
        note?: string | null;
      }): Promise<CallLog> {
        const log: CallLog = {
          id: newId(),
          user_id: userId,
          lead_id: input.lead_id,
          direction: input.direction ?? "outbound",
          outcome: input.outcome ?? null,
          note: input.note ?? null,
          created_at: now(),
        };
        await db
          .prepare(
            `INSERT INTO call_logs (id, user_id, lead_id, direction, outcome, note, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            log.id,
            log.user_id,
            log.lead_id,
            log.direction,
            log.outcome,
            log.note,
            log.created_at,
          )
          .run();

        await db
          .prepare(
            `UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE user_id = ? AND id = ?`,
          )
          .bind(log.created_at, log.created_at, userId, input.lead_id)
          .run();

        return log;
      },
    },
  };
}

export type ScopedDb = ReturnType<typeof scopedDb>;
