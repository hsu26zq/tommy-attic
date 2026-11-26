import { Server } from "@hocuspocus/server";
import { getRequestListener } from "@hono/node-server";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { env } from "./env.js";
import { collabConfig } from "./collab.js";
import notes from "./routes/notes.js";
import devices from "./routes/devices.js";
import qr from "./routes/qr.js";
import databases from "./routes/databases.js";

// The website reaches the REST API through its own /api/* path (a Vercel rewrite),
// so browsers see one site and cookies stay first-party.
// Live sync uses a WebSocket straight to this server (Vercel can't forward WebSockets).
const app = new Hono();
app.use("*", logger());

app.get("/", (c) => c.json({ name: "tommy-attic-api", ok: true }));
app.get("/health", (c) => c.json({ ok: true }));
app.route("/notes", notes);
app.route("/devices", devices);
app.route("/auth/qr", qr);
app.route("/databases", databases);

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Server error" }, 500);
});

const handleHttp = getRequestListener(app.fetch);

// One port for both: normal HTTP requests go to Hono, WebSocket upgrades go to the sync server.
const server = new Server({
  ...collabConfig,
  port: env.port,
  address: "0.0.0.0",
  async onRequest({ request, response }) {
    await handleHttp(request, response);
    // Tell Hocuspocus the request was handled (it otherwise writes its own reply).
    throw null;
  },
});

server.listen().then(() => console.log(`tommy-attic-api listening on :${env.port} (HTTP + live sync)`));
