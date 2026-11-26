import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { env } from "./env.js";
import notes from "./routes/notes.js";
import devices from "./routes/devices.js";

// The website reaches this API through its own /api/* path (a Vercel rewrite),
// so browsers see one site and cookies stay first-party.
const app = new Hono();
app.use("*", logger());

app.get("/", (c) => c.json({ name: "tommy-attic-api", ok: true }));
app.get("/health", (c) => c.json({ ok: true }));
app.route("/notes", notes);
app.route("/devices", devices);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Server error" }, 500);
});

serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`tommy-attic-api listening on :${info.port}`);
});
