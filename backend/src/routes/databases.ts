import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { randomBytes } from "node:crypto";
import { requireOwner, type AuthVars } from "../auth.js";

// Databases: a table inside a note. Each row is a note (title + properties + its own page).
// Column types: text, number, tags (many), select (one), status, url, checkbox, date.
const TYPES = new Set(["text", "number", "tags", "select", "status", "url", "checkbox", "date"]);
type Option = { name: string; color: string };
type Column = { id: string; name: string; type: string; width?: number; options?: Option[] };
const COLORS = new Set(["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"]);

const databases = new Hono<{ Variables: AuthVars }>();
databases.use("*", requireOwner);

const colId = () => randomBytes(4).toString("hex");

function cleanColumns(input: unknown): Column[] {
  if (!Array.isArray(input)) throw new HTTPException(400, { message: "columns must be a list" });
  return input.slice(0, 30).map((c) => {
    const col: Column = {
      id: typeof c?.id === "string" && c.id ? c.id.slice(0, 20) : colId(),
      name: String(c?.name ?? "Column").slice(0, 60) || "Column",
      type: TYPES.has(c?.type) ? c.type : "text",
    };
    if (typeof c?.width === "number") col.width = Math.round(Math.min(800, Math.max(80, c.width)));
    if (Array.isArray(c?.options)) {
      col.options = c.options.slice(0, 50).map((o: Partial<Option>) => ({
        name: String(o?.name ?? "").slice(0, 60),
        color: COLORS.has(String(o?.color)) ? String(o?.color) : "gray",
      })).filter((o: Option) => o.name);
    }
    return col;
  });
}

// View settings: layout, which column groups the board / places the calendar, filters
function cleanView(v: unknown) {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" ? x.slice(0, 40) : undefined);
  return {
    layout: ["table", "board", "calendar"].includes(String(o.layout)) ? o.layout : "table",
    groupBy: str(o.groupBy),
    dateBy: str(o.dateBy),
    sort:
      o.sort && typeof o.sort === "object" && typeof (o.sort as { col?: unknown }).col === "string"
        ? { col: String((o.sort as { col: string }).col).slice(0, 40), dir: (o.sort as { dir?: number }).dir === -1 ? -1 : 1 }
        : undefined,
    filters: Array.isArray(o.filters)
      ? o.filters.slice(0, 10).map((f) => ({ col: str(f?.col) ?? "", value: String(f?.value ?? "").slice(0, 100) }))
      : [],
  };
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
  const update: Record<string, unknown> = {};
  if ("columns" in body) update.columns = cleanColumns(body.columns);
  if ("view" in body) update.view = cleanView(body.view);
  const { data, error } = await c.var.db
    .from("databases")
    .update(update)
    .eq("id", c.req.param("id"))
    .select("*")
    .single();
  if (error) throw new HTTPException(500, { message: error.message });
  return c.json(data);
});

export default databases;
