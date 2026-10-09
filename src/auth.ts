import { betterAuth } from "better-auth";
import { sendEmail } from "./lib/email";

/**
 * Builds a Better Auth instance bound to this request's D1 database. Create
 * one per request (never cache at module scope) — the D1 binding, secrets,
 * and base URL all come from this request's `env`.
 */
export function createAuth(env: Env) {
  const hasGoogle = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

  return betterAuth({
    database: env.DB,
    baseURL: env.APP_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_URL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail(env, {
          to: user.email,
          subject: "Reset your Driver Desk password",
          html: `<p>Click the link below to reset your Driver Desk password. This link expires in 1 hour.</p><p><a href="${url}">${url}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
        });
      },
    },
    socialProviders: hasGoogle
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
  });
}

export type Auth = ReturnType<typeof createAuth>;
