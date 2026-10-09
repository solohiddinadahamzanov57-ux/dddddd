import type { CustomField, Lead } from "./types";

const CORE_FIELDS: Array<keyof Lead> = ["phone", "email", "company"];

export interface CompletenessResult {
  filled: number;
  total: number;
  percent: number;
  missing: string[];
}

/** Powers the dash bar: how much of a lead's info is filled in vs. missing. */
export function leadCompleteness(
  lead: Lead,
  customFields: CustomField[],
): CompletenessResult {
  const missing: string[] = [];
  let filled = 0;
  let total = CORE_FIELDS.length;

  for (const key of CORE_FIELDS) {
    const value = lead[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      filled += 1;
    } else {
      missing.push(key);
    }
  }

  const customData = safeParse(lead.custom_data);
  for (const field of customFields) {
    total += 1;
    const value = customData[field.field_key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      filled += 1;
    } else {
      missing.push(field.label);
    }
  }

  const percent = total === 0 ? 100 : Math.round((filled / total) * 100);
  return { filled, total, percent, missing };
}

export function fleetCompleteness(
  leads: Lead[],
  customFields: CustomField[],
): CompletenessResult {
  if (leads.length === 0) {
    return { filled: 0, total: 0, percent: 100, missing: [] };
  }
  let filled = 0;
  let total = 0;
  for (const lead of leads) {
    const r = leadCompleteness(lead, customFields);
    filled += r.filled;
    total += r.total;
  }
  const percent = total === 0 ? 100 : Math.round((filled / total) * 100);
  return { filled, total, percent, missing: [] };
}

function safeParse(json: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(json);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}
