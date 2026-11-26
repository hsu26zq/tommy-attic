import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireOwner, type AuthVars } from "../auth.js";

const notes = new Hono<{ Variables: AuthVars }>();
notes.use("*", requireOwner);

const LIST_FIELDS = "id,title,type,is_public,slug,updated_at,published_at";

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "note"}-${Math.random().toString(36).slice(2, 7)}`;
}

// List all notes (private and public)
notes.get("/", async (c) => {
  const { data, error } = await c.var.db.from("notes").select(LIST_FIELDS).order("updated_at", { ascending: false });
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

// New note
notes.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const type = body.type === "post" ? "post" : "note";
  const { data, error } = await c.var.db
    .from("notes")
    .insert({ title: body.title ?? "Untitled", type })
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data, 201);
});

// One note, full content
notes.get("/:id", async (c) => {
  const { data, error } = await c.var.db.from("notes").select("*").eq("id", c.req.param("id")).maybeSingle();
  if (error) throw new HTTPException(500, { message: error.message });
  if (!data) throw new HTTPException(404, { message: "Note not found" });
  return c.json(data);
});

// Save a note. If `base_updated_at` doesn't match, the note changed on another
// device since it was opened, so we refuse (409) instead of overwriting.
notes.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const { data: current, error: readError } = await c.var.db
    .from("notes")
    .select("updated_at,slug,published_at,title")
    .eq("id", id)
    .maybeSingle();
  if (readError) throw new HTTPException(500, { message: readError.message });
  if (!current) throw new HTTPException(404, { message: "Note not found" });

  if (body.base_updated_at && new Date(body.base_updated_at).getTime() !== new Date(current.updated_at).getTime()) {
    return c.json({ error: "conflict", updated_at: current.updated_at }, 409);
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string") update.title = body.title.slice(0, 300) || "Untitled";
  if (body.type === "note" || body.type === "post") update.type = body.type;
  if (Array.isArray(body.content)) update.content = body.content;
  if (typeof body.markdown === "string") update.markdown = body.markdown;
  if (typeof body.is_public === "boolean") {
    update.is_public = body.is_public;
    if (body.is_public && !current.slug) update.slug = slugify((update.title as string) ?? current.title);
    if (body.is_public && !current.published_at) update.published_at = update.updated_at;
  }

  const { data, error } = await c.var.db.from("notes").update(update).eq("id", id).select(LIST_FIELDS).single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

notes.delete("/:id", async (c) => {
  const { error } = await c.var.db.from("notes").delete().eq("id", c.req.param("id"));
  if (error) throw new HTTPException(500, { message: error.message });
  return c.body(null, 204);
});

export default notes;
