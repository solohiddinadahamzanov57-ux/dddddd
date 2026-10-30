import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Logs instead of sending. Used whenever no real provider is configured --
 * matches how this project treats every other not-yet-configured external
 * service (Supabase, Stripe): build the real integration point now, keep
 * the app working without it, swap in a real provider by setting one env
 * var once there's an account for it.
 */
class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    console.warn(`[email:console] to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}

let provider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  // No provider is configured yet (no RESEND_API_KEY or similar in env.ts).
  // When one is added, swap this for the real implementation here -- every
  // call site already goes through this one function.
  if (!provider) {
    provider = new ConsoleEmailProvider();
  }
  return provider;
}
