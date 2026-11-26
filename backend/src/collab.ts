import { Database } from "@hocuspocus/extension-database";
import { Hocuspocus } from "@hocuspocus/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbAsUser } from "./auth.js";

// Live sync between your devices. Each note is one shared Yjs document named by its id.
// Edits merge automatically (CRDT), and the merged state is saved back to Supabase.
type Ctx = { db: SupabaseClient };

export const collabConfig = {
  name: "tommy-attic",
  // Wait 2s after the last change before saving; never wait more than 10s.
  debounce: 2000,
  maxDebounce: 10000,
  quiet: true,

  // Same owner check as the API: a valid login AND the owner account.
  async onAuthenticate({ token, documentName }: { token: string; documentName: string }) {
    if (!token) throw new Error("Not logged in");
    const db = dbAsUser(token);
    const { data: user, error } = await db.auth.getUser(token);
    if (error || !user.user) throw new Error("Invalid login");
    const { data: settings } = await db.from("settings").select("owner_id").eq("id", 1).maybeSingle();
    if (!settings || settings.owner_id !== user.user.id) throw new Error("Not the owner");
    const { data: note } = await db.from("notes").select("id").eq("id", documentName).maybeSingle();
    if (!note) throw new Error("Note not found");
    return { db } satisfies Ctx;
  },

  extensions: [
    new Database({
      fetch: async ({ documentName, context }) => {
        const { data } = await (context as Ctx).db.from("notes").select("ydoc").eq("id", documentName).maybeSingle();
        return data?.ydoc ? new Uint8Array(Buffer.from(data.ydoc, "base64")) : null;
      },
      store: async ({ documentName, state, lastContext }) => {
        const { error } = await (lastContext as Ctx).db
          .from("notes")
          .update({ ydoc: Buffer.from(state).toString("base64") })
          .eq("id", documentName);
        if (error) console.error("[collab] save failed", documentName, error.message);
      },
    }),
  ],
};

export function createCollab() {
  return new Hocuspocus(collabConfig);
}
