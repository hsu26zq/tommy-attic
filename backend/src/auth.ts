import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { env } from "./env.js";

export type AuthVars = { user: User; db: SupabaseClient };

// A database client that acts as the logged-in user, so the database's own
// security rules (Row Level Security) apply to every query.
export function dbAsUser(jwt: string): SupabaseClient {
  return createClient(env.supabaseUrl, env.supabaseKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Lock 2 of 3: only the owner (Tommy) gets past this point.
export const requireOwner = createMiddleware<{ Variables: AuthVars }>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const jwt = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!jwt) throw new HTTPException(401, { message: "Not logged in" });

  const db = dbAsUser(jwt);
  const { data: userData, error } = await db.auth.getUser(jwt);
  if (error || !userData.user) throw new HTTPException(401, { message: "Invalid login" });

  // The settings row is only readable by the owner, so getting it back proves ownership.
  const { data: settings } = await db.from("settings").select("owner_id").eq("id", 1).maybeSingle();
  if (!settings || settings.owner_id !== userData.user.id) {
    throw new HTTPException(403, { message: "Not the owner" });
  }

  c.set("user", userData.user);
  c.set("db", db);
  await next();
});
