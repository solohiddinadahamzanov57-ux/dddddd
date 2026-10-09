/**
 * Thin wrapper around the Resend API. Runs server-side only (this file is
 * never bundled into anything the browser loads) — the API key never leaves
 * the Worker.
 */
export async function sendEmail(
  env: Pick<Env, "RESEND_API_KEY" | "RESEND_FROM_EMAIL">,
  message: { to: string; subject: string; html: string },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(
      `RESEND_API_KEY not set — skipping email to ${message.to}: ${message.subject}`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.RESEND_FROM_EMAIL || "onboarding@resend.dev",
      to: message.to,
      subject: message.subject,
      html: message.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Resend email failed (${res.status}): ${body}`);
  }
}
