import "server-only";

import { getEmailProvider } from "@/lib/notifications/email";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/types";

type NotificationType = Database["public"]["Enums"]["notification_type"];

/** Sends an email and records it in `notifications` for an audit trail, regardless of whether the send actually reached a real inbox. */
export async function notifyByEmail(params: {
  companyId: string;
  accountId: string;
  type: NotificationType;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const admin = createAdminClient();
  let status: "sent" | "failed" = "sent";

  try {
    await getEmailProvider().send({ to: params.to, subject: params.subject, text: params.text });
  } catch (error) {
    console.error("notifyByEmail send failed:", error);
    status = "failed";
  }

  await admin.from("notifications").insert({
    company_id: params.companyId,
    account_id: params.accountId,
    type: params.type,
    channel: "email",
    content: { subject: params.subject, text: params.text },
    status,
    sent_at: status === "sent" ? new Date().toISOString() : null,
  });
}
