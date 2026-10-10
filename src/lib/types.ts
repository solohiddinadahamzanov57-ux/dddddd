export type LeadStatus =
  | "new"
  | "contacted"
  | "qualified"
  | "scheduled"
  | "hired"
  | "not_interested"
  | "lost";

export const LEAD_STATUSES: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "scheduled",
  "hired",
  "not_interested",
  "lost",
];

export interface Lead {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  state: string | null;
  cdl: string | null;
  medical_card: string | null;
  status: LeadStatus;
  source: string | null;
  notes: string | null;
  custom_data: string;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export type CustomFieldType = "text" | "number" | "date" | "select";

export interface CustomField {
  id: string;
  user_id: string;
  field_key: string;
  label: string;
  field_type: CustomFieldType;
  options: string | null;
  required: number;
  sort_order: number;
  created_at: string;
}

export interface InfoTemplate {
  id: string;
  user_id: string;
  title: string;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type MessageChannel = "sms" | "email";

export interface MessageTemplate {
  id: string;
  user_id: string;
  title: string;
  channel: MessageChannel;
  body: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type CallDirection = "outbound" | "inbound";

export interface CallLog {
  id: string;
  user_id: string;
  lead_id: string;
  direction: CallDirection;
  outcome: string | null;
  note: string | null;
  created_at: string;
}

export type DocumentKind = "cdl" | "medical" | "other";

export const DOCUMENT_KINDS: DocumentKind[] = ["cdl", "medical", "other"];

/** Metadata only — the base64 `data` column is fetched separately. */
export interface LeadDocumentMeta {
  id: string;
  user_id: string;
  lead_id: string;
  kind: DocumentKind;
  file_name: string | null;
  mime_type: string;
  size: number;
  created_at: string;
}

export interface LeadDocument extends LeadDocumentMeta {
  data: string;
}
