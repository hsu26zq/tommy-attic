import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { HTTPException } from "hono/http-exception";
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireOwner, type AuthVars } from "../auth.js";
import { env } from "../env.js";
import { sendLoginAlert } from "../alerts.js";

// Trusted devices ("whitelist"). Each approved device holds a random secret
// token in a cookie that JavaScript can't read — like a key card.
const devices = new Hono<{ Variables: AuthVars }>();
devices.use("*", requireOwner);

const COOKIE = "ta_device";
const FIELDS = "id,name,approved,user_agent,created_at,last_seen_at";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");


async function currentDevice(c: Context, db: SupabaseClient) {
  const token = getCookie(c, COOKIE);
  if (!token) return null;
  const { data } = await db.from("devices").select(FIELDS).eq("token_hash", hash(token)).maybeSingle();
  if (data) {
    await db.from("devices").update({ last_seen_at: new Date().toISOString() }).eq("id", data.id);
  }
  return data;
}

// Is this browser a trusted device?
devices.get("/me", async (c) => {
  const device = await currentDevice(c, c.var.db);
  return c.json({ device });
});

// Registers this browser as a pending device (done automatically after login).
// Approval happens only by hand in Supabase (devices table → approved = true).
devices.post("/register", async (c) => {
  const existing = await currentDevice(c, c.var.db);
  if (existing) return c.json({ device: existing });

  const body = await c.req.json().catch(() => ({}));
  const token = randomBytes(32).toString("base64url");

  const { data, error } = await c.var.db
    .from("devices")
    .insert({
      name: String(body.name ?? "Unnamed device").slice(0, 80),
      token_hash: hash(token),
      approved: false,
      user_agent: (c.req.header("User-Agent") ?? "").slice(0, 300),
    })
    .select(FIELDS)
    .single();
  if (error) throw new HTTPException(500, { message: error.message });

  setCookie(c, COOKIE, token, {
    httpOnly: true,
    secure: env.secureCookies,
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
  return c.json({ device: data }, 201);
});





// Called right after every login. Every login sends an alert email.
devices.post("/login-event", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const method = String(body.method ?? "unknown");
  const me = await currentDevice(c, c.var.db);
  const trusted = !!me?.approved;
  await sendLoginAlert({
    method,
    trusted,
    device: me?.name ?? null,
    userAgent: c.req.header("User-Agent") ?? "unknown",
    ip: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown",
  });
  return c.json({ trusted });
});

export default devices;
