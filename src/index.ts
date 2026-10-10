import { Hono } from "hono";
import { createAuth } from "./auth";
import { requireAuth, type AuthedVars } from "./middleware/auth";
import { fieldsRoute } from "./routes/fields";
import { importRoute } from "./routes/import";
import { leadsRoute } from "./routes/leads";
import { meRoute } from "./routes/me";
import { infoTemplatesRoute, messageTemplatesRoute } from "./routes/templates";

const app = new Hono<{ Bindings: Env; Variables: AuthedVars }>();

// Better Auth's own endpoints: /api/auth/sign-in/email, /sign-up/email,
// /sign-in/social, /sign-out, /reset-password, /callback/google, etc.
app.all("/api/auth/*", (c) => {
  const auth = createAuth(c.env);
  return auth.handler(c.req.raw);
});

const api = new Hono<{ Bindings: Env; Variables: AuthedVars }>();
api.use("*", requireAuth);
api.route("/leads", leadsRoute);
api.route("/import", importRoute);
api.route("/custom-fields", fieldsRoute);
api.route("/info-templates", infoTemplatesRoute);
api.route("/message-templates", messageTemplatesRoute);
api.route("/me", meRoute);

app.route("/api", api);

// Everything else (/, /login.html, /signup.html, ...) is a static file
// served by Workers Assets. /dashboard is special-cased below: it requires a
// signed-in session, redirecting to /login.html otherwise.
app.get("/dashboard", async (c) => {
  const auth = createAuth(c.env);
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) {
    return c.redirect("/login.html", 302);
  }
  const assetUrl = new URL("/dashboard.html", c.req.raw.url);
  return c.env.ASSETS.fetch(new Request(assetUrl, c.req.raw));
});

app.get("/", (c) => {
  const assetUrl = new URL("/index.html", c.req.raw.url);
  return c.env.ASSETS.fetch(new Request(assetUrl, c.req.raw));
});

app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
