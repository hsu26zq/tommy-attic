import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireOwner, type AuthVars } from "../auth.js";
import { env } from "../env.js";

// QR login (like WhatsApp Web):
//  1. The computer asks for a login and shows a QR code.
//  2. Your logged-in iPhone scans it, confirms with Face ID, and approves.
//  3. The computer picks up a one-time login token and is logged in.
// No Bluetooth needed. The QR expires after 2 minutes and works once.

const qr = new Hono<{ Variables: AuthVars }>();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");

function admin() {
  if (!env.supabaseSecretKey) throw new HTTPException(503, { message: "QR login isn't set up yet (missing SUPABASE_SECRET_KEY)" });
  return createClient(env.supabaseUrl, env.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Step 1 — computer: start a request
qr.post("/start", async (c) => {
  const db = admin();
  const pollSecret = randomBytes(24).toString("base64url");
  // Clean up old requests while we're here
  await db.from("login_requests").delete().lt("expires_at", new Date(Date.now() - 10 * 60 * 1000).toISOString());
  const { data, error } = await db
    .from("login_requests")
    .insert({
      poll_hash: hash(pollSecret),
      user_agent: (c.req.header("User-Agent") ?? "").slice(0, 300),
      ip: c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For")?.split(",")[0] ?? null,
    })
    .select("id,expires_at")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json({ id: data.id, pollSecret, expiresAt: data.expires_at });
});

// Step 3 — computer: check if the phone approved; hands over the token exactly once
qr.post("/poll", async (c) => {
  const { id, pollSecret } = await c.req.json().catch(() => ({}));
  if (!id || !pollSecret) throw new HTTPException(400, { message: "Missing id" });
  const db = admin();
  const { data } = await db.from("login_requests").select("*").eq("id", id).maybeSingle();
  if (!data || data.poll_hash !== hash(String(pollSecret))) throw new HTTPException(404, { message: "Unknown request" });
  if (data.status === "used") return c.json({ status: "used" });
  if (data.status === "pending") {
    return c.json({ status: new Date(data.expires_at) < new Date() ? "expired" : "pending" });
  }
  // approved → hand over once
  const { data: claimed } = await db
    .from("login_requests")
    .update({ status: "used", token_hash: null })
    .eq("id", id)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();
  if (!claimed) return c.json({ status: "used" });
  return c.json({ status: "approved", tokenHash: data.token_hash });
});

// Step 2 — phone (must be you, logged in): see who's asking
qr.get("/:id", requireOwner, async (c) => {
  const db = admin();
  const { data } = await db
    .from("login_requests")
    .select("id,status,user_agent,ip,created_at,expires_at")
    .eq("id", c.req.param("id"))
    .maybeSingle();
  if (!data) throw new HTTPException(404, { message: "This QR code isn't valid" });
  return c.json(data);
});

// Step 2 — phone: approve. Requires a fresh Face ID / passkey check from the last 3 minutes.
qr.post("/:id/approve", requireOwner, async (c) => {
  const jwt = (c.req.header("Authorization") ?? "").slice(7);
  const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString());
  const lastAuth = Math.max(0, ...((claims.amr ?? []) as { timestamp: number }[]).map((a) => a.timestamp ?? 0));
  if (Date.now() / 1000 - lastAuth > 180) {
    throw new HTTPException(401, { message: "Confirm with Face ID first" });
  }

  const db = admin();
  const { data: req } = await db.from("login_requests").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (!req) throw new HTTPException(404, { message: "This QR code isn't valid" });
  if (req.status !== "pending") throw new HTTPException(409, { message: "This QR code was already used" });
  if (new Date(req.expires_at) < new Date()) throw new HTTPException(410, { message: "This QR code expired. Refresh it on the computer." });

  // Create a one-time login for the owner (no email is sent)
  const email = c.var.user.email!;
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) throw new HTTPException(500, { message: error?.message ?? "Couldn't create login" });

  const { error: upErr } = await db
    .from("login_requests")
    .update({ status: "approved", token_hash: link.properties.hashed_token })
    .eq("id", req.id)
    .eq("status", "pending");
  if (upErr) throw new HTTPException(500, { message: upErr.message });
  return c.json({ ok: true });
});

// New passkey: a one-time setup code (set in the database, expires in 30 minutes) logs you in once
// so this phone can register a fresh passkey. The code is wiped as soon as it's used.
qr.post("/setup", async (c) => {
  const { code } = await c.req.json().catch(() => ({ code: "" }));
  if (typeof code !== "string" || code.length < 20) throw new HTTPException(400, { message: "This setup link isn't valid" });
  const db = admin();
  const { data: s } = await db.from("settings").select("owner_id,setup_code_hash,setup_expires_at").eq("id", 1).maybeSingle();
  if (!s?.setup_code_hash || s.setup_code_hash !== hash(code)) throw new HTTPException(403, { message: "This setup link isn't valid or was already used" });
  if (!s.setup_expires_at || new Date(s.setup_expires_at) < new Date()) throw new HTTPException(410, { message: "This setup link expired" });

  // Use it up first, so it can never work twice
  const { data: used } = await db
    .from("settings")
    .update({ setup_code_hash: null, setup_expires_at: null })
    .eq("id", 1)
    .eq("setup_code_hash", hash(code))
    .select("id");
  if (!used?.length) throw new HTTPException(403, { message: "This setup link was already used" });

  const { data: owner } = await db.auth.admin.getUserById(s.owner_id);
  if (!owner?.user?.email) throw new HTTPException(500, { message: "Owner account not found" });
  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: owner.user.email });
  if (error || !link.properties?.hashed_token) throw new HTTPException(500, { message: error?.message ?? "Couldn't create login" });
  return c.json({ tokenHash: link.properties.hashed_token });
});

export default qr;
