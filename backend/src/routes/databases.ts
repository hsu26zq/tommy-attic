import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { randomBytes } from "node:crypto";
import { requireOwner, type AuthVars } from "../auth.js";

// Databases: a table inside a note. Each row is a note (title + properties + its own page).
// Column types: text, number, select (tags), url, checkbox, date.
const TYPES = new Set(["text", "number", "tags", "url", "checkbox", "date"]);
type Column = { id: string; name: string; type: string };

const databases = new Hono<{ Variables: AuthVars }>();
databases.use("*", requireOwner);

const colId = () => randomBytes(4).toString("hex");

function cleanColumns(input: unknown): Column[] {
  if (!Array.isArray(input)) throw new HTTPException(400, { message: "columns must be a list" });
  return input.slice(0, 30).map((c) => ({
    id: typeof c?.id === "string" && c.id ? c.id.slice(0, 20) : colId(),
    name: String(c?.name ?? "Column").slice(0, 60) || "Column",
    type: TYPES.has(c?.type) ? c.type : "text",
  }));
}

databases.post("/", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (typeof body.note_id !== "string") throw new HTTPException(400, { message: "note_id is required" });
  const columns = body.columns ? cleanColumns(body.columns) : [{ id: colId(), name: "Tags", type: "tags" }];
  const { data, error } = await c.var.db.from("databases").insert({ note_id: body.note_id, columns }).select("*").single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data, 201);
});

databases.get("/:id", async (c) => {
  const id = c.req.param("id");
  const [{ data: db, error }, { data: rows, error: rowsError }] = await Promise.all([
    c.var.db.from("databases").select("*").eq("id", id).maybeSingle(),
    c.var.db
      .from("notes")
      .select("id,title,icon,properties,position,updated_at")
      .eq("database_id", id)
      .is("deleted_at", null)
      .order("position"),
  ]);
  if (error || rowsError) throw new HTTPException(500, { message: (error ?? rowsError)!.message });
  if (!db) throw new HTTPException(404, { message: "Database not found" });
  return c.json({ database: db, rows });
});

databases.patch("/:id", async (c) => {
  const body = await c.req.json();
  const { data, error } = await c.var.db
    .from("databases")
    .update({ columns: cleanColumns(body.columns) })
    .eq("id", c.req.param("id"))
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

export default databases;
