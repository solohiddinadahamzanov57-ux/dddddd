/**
 * Cleans up lead fields coming from imports (spreadsheets, AI extraction).
 * The browser has a copy of these rules in public/js/import.js so the review
 * table shows exactly what will be saved; keep the two in sync.
 */

export const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
  PR: "Puerto Rico",
};

const STATE_BY_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATES).map(([code, name]) => [name.toLowerCase(), code]),
);

// Longest first so "west virginia" wins over "virginia".
const STATE_NAMES_LONGEST_FIRST = Object.entries(STATE_BY_NAME).sort(
  (a, b) => b[0].length - a[0].length,
);

function clean(value: unknown, max = 500): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, " ").trim();
  if (!s || /^(null|n\/a|na|none|-|undefined)$/i.test(s)) return null;
  return s.slice(0, max);
}

export function normalizePhone(value: unknown): string | null {
  const s = clean(value, 60);
  if (!s) return null;
  let digits = s.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return s;
}

export function normalizeEmail(value: unknown): string | null {
  const s = clean(value, 200);
  if (!s) return null;
  const match = s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

export function normalizeState(value: unknown): string | null {
  const s = clean(value, 60);
  if (!s) return null;
  const upper = s.toUpperCase().replace(/\./g, "");
  if (US_STATES[upper]) return upper;
  const byName = STATE_BY_NAME[s.toLowerCase()];
  if (byName) return byName;
  // "Dallas, TX" / "Houston Texas 77001" → pick out the state.
  const code = s.match(/\b([A-Z]{2})\b(?:\s+\d{5})?\s*$/);
  if (code && US_STATES[code[1]]) return code[1];
  const lower = s.toLowerCase();
  for (const [name, c] of STATE_NAMES_LONGEST_FIRST) {
    if (new RegExp(`\\b${name}\\b`).test(lower)) return c;
  }
  return s;
}

export function normalizeName(value: unknown): string | null {
  const s = clean(value, 120);
  if (!s) return null;
  const letters = s.replace(/[^A-Za-z]/g, "");
  const shouting = letters.length > 1 && letters === letters.toUpperCase();
  const whisper = letters.length > 1 && letters === letters.toLowerCase();
  if (!shouting && !whisper) return s;
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
}

export interface ImportedLead {
  name: string;
  phone: string | null;
  email: string | null;
  state: string | null;
  cdl: string | null;
  medical_card: string | null;
  notes: string | null;
}

/** Returns null when there's nothing usable (no name, phone, or email). */
export function normalizeImportedLead(raw: Record<string, unknown>): ImportedLead | null {
  const phone = normalizePhone(raw.phone);
  const email = normalizeEmail(raw.email);
  let name = normalizeName(raw.name);
  if (!name && !phone && !email) return null;
  if (!name) name = email ? email.split("@")[0] : phone ?? "Unnamed lead";
  return {
    name,
    phone,
    email,
    state: normalizeState(raw.state),
    cdl: clean(raw.cdl, 200),
    medical_card: clean(raw.medical_card, 200),
    notes: clean(raw.notes, 2000),
  };
}
