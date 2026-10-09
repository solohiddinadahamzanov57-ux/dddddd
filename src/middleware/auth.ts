import type { Context, Next } from "hono";
import { createAuth } from "../auth";

export type AuthedVars = {
  userId: string;
  userEmail: string;
};

/** Attaches the logged-in user's id to the request, or responds 401. */
export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: AuthedVars }>,
  next: Next,
) {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!session) {
    return c.json({ error: "Not signed in" }, 401);
  }

  c.set("userId", session.user.id);
  c.set("userEmail", session.user.email);
  await next();
}
