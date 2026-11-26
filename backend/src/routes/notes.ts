import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireOwner, type AuthVars } from "../auth.js";

const notes = new Hono<{ Variables: AuthVars }>();
notes.use("*", requireOwner);

const LIST_FIELDS = "id,title,icon,parent_id,position,pinned,wide,is_public,slug,updated_at,published_at";
const VERSION_EVERY_MS = 10 * 60 * 1000; // keep a history snapshot at most every 10 minutes
const MAX_VERSIONS = 50;

function fail(error: { message: string } | null) {
  if (error) throw new HTTPException(500, { message: error.message });
}

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "note"}-${Math.random().toString(36).slice(2, 7)}`;
}

// All pages (not database rows, not in the trash) — the sidebar builds the tree from parent_id
notes.get("/", async (c) => {
  const { data, error } = await c.var.db
    .from("notes")
    .select(LIST_FIELDS)
    .is("database_id", null)
    .is("deleted_at", null)
    .order("position")
    .order("created_at");
  fail(error);
  return c.json(data);
});

// Search titles and text
notes.get("/search", async (c) => {
  const q = (c.req.query("q") ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 100);
  if (!q) return c.json([]);
  const { data, error } = await c.var.db
    .from("notes")
    .select("id,title,icon,markdown,database_id")
    .is("deleted_at", null)
    .or(`title.ilike.%${q}%,markdown.ilike.%${q}%`)
    .order("updated_at", { ascending: false })
    .limit(20);
  fail(error);
  const lower = q.toLowerCase();
  return c.json(
    (data ?? []).map((n) => {
      const i = n.markdown.toLowerCase().indexOf(lower);
      const snippet = i >= 0 ? n.markdown.slice(Math.max(0, i - 40), i + 80).replace(/\s+/g, " ") : "";
      return { id: n.id, title: n.title, icon: n.icon, snippet, isRow: !!n.database_id };
    }),
  );
});

// Everything, for "Export everything": every page and database row with its Markdown
notes.get("/export", async (c) => {
  const [{ data: list, error }, { data: dbs, error: dbError }] = await Promise.all([
    c.var.db.from("notes").select("id,title,icon,parent_id,position,database_id,properties,markdown").is("deleted_at", null).order("position"),
    c.var.db.from("databases").select("id,note_id,columns"),
  ]);
  fail(error);
  fail(dbError);
  return c.json({ notes: list ?? [], databases: dbs ?? [] });
});

// Trash
notes.get("/trash", async (c) => {
  const { data, error } = await c.var.db
    .from("notes")
    .select("id,title,icon,parent_id,deleted_at")
    .not("deleted_at", "is", null)
    .is("database_id", null)
    .order("deleted_at", { ascending: false });
  fail(error);
  // Only show the top of each deleted branch
  const ids = new Set((data ?? []).map((n) => n.id));
  return c.json((data ?? []).filter((n) => !n.parent_id || !ids.has(n.parent_id)));
});

notes.post("/trash/empty", async (c) => {
  const { error } = await c.var.db.from("notes").delete().not("deleted_at", "is", null);
  fail(error);
  return c.body(null, 204);
});

// New page (or database row when database_id is given)
notes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parent_id = typeof body.parent_id === "string" ? body.parent_id : null;
  const database_id = typeof body.database_id === "string" ? body.database_id : null;

  let last = c.var.db.from("notes").select("position").order("position", { ascending: false }).limit(1);
  last = database_id
    ? last.eq("database_id", database_id)
    : parent_id
      ? last.eq("parent_id", parent_id)
      : last.is("parent_id", null).is("database_id", null);
  const { data: lastRow } = await last.maybeSingle();

  const insert: Record<string, unknown> = {
    title: typeof body.title === "string" ? body.title.slice(0, 300) : "Untitled",
    parent_id,
    database_id,
    position: (lastRow?.position ?? 0) + 1,
  };
  if (typeof body.icon === "string") insert.icon = body.icon.slice(0, 16);
  if (body.properties && typeof body.properties === "object") insert.properties = body.properties;
  if (Array.isArray(body.content)) insert.content = body.content;
  if (typeof body.markdown === "string") insert.markdown = body.markdown;

  const { data, error } = await c.var.db.from("notes").insert(insert).select("*").single();
  fail(error);
  return c.json(data, 201);
});

// One note with its path (breadcrumbs)
notes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [{ data, error }, { data: path }] = await Promise.all([
    c.var.db.from("notes").select("*").eq("id", id).maybeSingle(),
    c.var.db.rpc("note_ancestors", { target: id }),
  ]);
  fail(error);
  if (!data) throw new HTTPException(404, { message: "Note not found" });
  return c.json({ ...data, path: path ?? [] });
});

notes.get("/:id/backlinks", async (c) => {
  const { data, error } = await c.var.db.rpc("note_backlinks", { target: c.req.param("id") });
  fail(error);
  return c.json(data ?? []);
});

// Save. Live sync merges the edits themselves; this keeps title, settings and the readable copies.
notes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { data: current, error: readError } = await c.var.db
    .from("notes")
    .select("slug,published_at,title,markdown")
    .eq("id", id)
    .maybeSingle();
  fail(readError);
  if (!current) throw new HTTPException(404, { message: "Note not found" });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") update.title = body.title.slice(0, 300) || "Untitled";
  if (typeof body.icon === "string" || body.icon === null) update.icon = body.icon;
  if (Array.isArray(body.content)) update.content = body.content;
  if (typeof body.markdown === "string") update.markdown = body.markdown;
  // Sync state, saved with every edit so a note always opens instantly from the database
  if (typeof body.ydoc === "string" && body.ydoc.length < 20_000_000) update.ydoc = body.ydoc;
  if (body.properties && typeof body.properties === "object") update.properties = body.properties;
  if ("parent_id" in body) {
    if (body.parent_id === id) throw new HTTPException(400, { message: "A page can't be inside itself" });
    if (body.parent_id) {
      const { data: path } = await c.var.db.rpc("note_ancestors", { target: body.parent_id });
      if ((path ?? []).some((p: { id: string }) => p.id === id)) {
        throw new HTTPException(400, { message: "A page can't move inside its own sub-page" });
      }
    }
    update.parent_id = body.parent_id || null;
  }
  if (typeof body.position === "number") update.position = body.position;
  if (typeof body.cover === "string" || body.cover === null) update.cover = body.cover ? body.cover.slice(0, 500) : null;
  if (typeof body.wide === "boolean") update.wide = body.wide;
  if (typeof body.pinned === "boolean") update.pinned = body.pinned;
  if (typeof body.is_public === "boolean") {
    update.is_public = body.is_public;
    if (body.is_public && !current.slug) update.slug = slugify((update.title as string) ?? current.title);
    if (body.is_public && !current.published_at) update.published_at = update.updated_at;
  }

  const { data, error } = await c.var.db.from("notes").update(update).eq("id", id).select(LIST_FIELDS).single();
  fail(error);

  // History snapshot (at most every 10 minutes, keep the latest 50)
  if (Array.isArray(body.content) && body.markdown !== current.markdown) {
    const { data: lastV } = await c.var.db
      .from("note_versions")
      .select("created_at")
      .eq("note_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastV || Date.now() - new Date(lastV.created_at).getTime() > VERSION_EVERY_MS) {
      await c.var.db.from("note_versions").insert({
        note_id: id,
        title: (update.title as string) ?? current.title,
        content: body.content,
        markdown: body.markdown ?? "",
      });
      const { data: old } = await c.var.db
        .from("note_versions")
        .select("id")
        .eq("note_id", id)
        .order("created_at", { ascending: false })
        .range(MAX_VERSIONS, MAX_VERSIONS + 100);
      if (old?.length) await c.var.db.from("note_versions").delete().in("id", old.map((v) => v.id));
    }
  }
  return c.json(data);
});

// Duplicate a page (its own content; sub-pages stay with the original)
notes.post("/:id/duplicate", async (c) => {
  const { data: src, error } = await c.var.db
    .from("notes")
    .select("title,icon,cover,wide,parent_id,position,content,markdown,ydoc")
    .eq("id", c.req.param("id"))
    .maybeSingle();
  fail(error);
  if (!src) throw new HTTPException(404, { message: "Note not found" });
  let next = c.var.db.from("notes").select("position").gt("position", src.position).is("database_id", null).order("position").limit(1);
  next = src.parent_id ? next.eq("parent_id", src.parent_id) : next.is("parent_id", null);
  const { data: after } = await next.maybeSingle();
  const { data, error: insError } = await c.var.db
    .from("notes")
    .insert({ ...src, title: `${src.title} copy`.slice(0, 300), position: after ? (src.position + after.position) / 2 : src.position + 1 })
    .select(LIST_FIELDS)
    .single();
  fail(insError);
  return c.json(data, 201);
});

// Move to trash (with everything under it). ?forever=1 deletes permanently.
notes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  if (c.req.query("forever")) {
    const { error } = await c.var.db.from("notes").delete().eq("id", id);
    fail(error);
  } else {
    const { error } = await c.var.db.rpc("set_trashed", { root: id, trashed: true });
    fail(error);
  }
  return c.body(null, 204);
});

// Restore from trash. If its parent is still in the trash, it comes back at the top level.
notes.post("/:id/restore", async (c) => {
  const id = c.req.param("id");
  const { error } = await c.var.db.rpc("set_trashed", { root: id, trashed: false });
  fail(error);
  const { data: note } = await c.var.db.from("notes").select("parent_id").eq("id", id).maybeSingle();
  if (note?.parent_id) {
    const { data: parent } = await c.var.db.from("notes").select("deleted_at").eq("id", note.parent_id).maybeSingle();
    if (!parent || parent.deleted_at) await c.var.db.from("notes").update({ parent_id: null }).eq("id", id);
  }
  return c.json({ ok: true });
});

// Version history
notes.get("/:id/versions", async (c) => {
  const { data, error } = await c.var.db
    .from("note_versions")
    .select("id,title,created_at")
    .eq("note_id", c.req.param("id"))
    .order("created_at", { ascending: false });
  fail(error);
  return c.json(data ?? []);
});

notes.get("/:id/versions/:vid", async (c) => {
  const { data, error } = await c.var.db
    .from("note_versions")
    .select("*")
    .eq("note_id", c.req.param("id"))
    .eq("id", c.req.param("vid"))
    .maybeSingle();
  fail(error);
  if (!data) throw new HTTPException(404, { message: "Version not found" });
  return c.json(data);
});

export default notes;
