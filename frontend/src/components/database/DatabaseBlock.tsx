"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { createReactBlockSpec } from "@blocknote/react";
import { api, type Column, type Database, type DbView, type Row } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { optionsOf, valueText } from "./PropertyCell";
import { type DbApi } from "./shared";
import TableView from "./TableView";
import Popover from "./Popover";
import { toast } from "@/lib/exportNote";
import BoardView from "./BoardView";
import CalendarView from "./CalendarView";
import GalleryView from "./GalleryView";

// Database block: rows are notes with their own pages. Seen as a table, a board, or a calendar.
const RowPanel = dynamic(() => import("./RowPanel"), { ssr: false });

const newId = () => Math.random().toString(36).slice(2, 10);

async function loadEditable(id: string) {
  return api<{ database: Database; rows: Row[] }>(`/databases/${id}`);
}

// Read-only views (like version history) read the database directly.
async function loadPublic(id: string) {
  const sb = supabase();
  const [{ data: database }, { data: rows }] = await Promise.all([
    sb.from("databases").select("*").eq("id", id).maybeSingle(),
    sb.from("notes").select("id,title,icon,properties,position").eq("database_id", id).is("deleted_at", null).order("position"),
  ]);
  return { database: database as Database, rows: (rows ?? []) as Row[] };
}

function matches(db: Database, row: Row, f: { col: string; value: string }) {
  const want = f.value.trim().toLowerCase();
  if (!want) return true;
  if (f.col === "title") return (row.title || "").toLowerCase().includes(want);
  const col = db.columns.find((c) => c.id === f.col);
  if (!col) return true;
  const v = row.properties[col.id];
  if (col.type === "select" || col.type === "status") return String(v ?? "").toLowerCase() === want;
  if (col.type === "tags") return Array.isArray(v) && v.some((t) => String(t).toLowerCase() === want);
  if (col.type === "checkbox") return (want === "yes") === !!v;
  return valueText(col, v).toLowerCase().includes(want);
}

function FilterMenu({ anchor, db, onAdd, onClose }: { anchor: HTMLElement | null; db: Database; onAdd: (f: { col: string; value: string }) => void; onClose: () => void }) {
  const [col, setCol] = useState<string | null>(null);
  const column = db.columns.find((c) => c.id === col);
  const choices = column && (column.type === "checkbox" ? ["yes", "no"] : ["select", "status", "tags"].includes(column.type) ? optionsOf(column).map((o) => o.name) : null);
  return (
    <Popover anchor={anchor} onClose={onClose} align="right" className="db-pop">
      {!col ? (
        <>
          <div className="db-pop-label">Filter by</div>
          <button onClick={() => setCol("title")}>Name</button>
          {db.columns.map((c) => <button key={c.id} onClick={() => setCol(c.id)}>{c.name}</button>)}
        </>
      ) : choices ? (
        <>
          <div className="db-pop-label">{column?.name} is</div>
          {choices.map((v) => <button key={v} onClick={() => onAdd({ col, value: v })}>{v}</button>)}
          {!choices.length && <div className="muted small db-pop-note">No options yet</div>}
        </>
      ) : (
        <>
          <div className="db-pop-label">{col === "title" ? "Name" : column?.name} contains</div>
          <input autoFocus onKeyDown={(e) => e.key === "Enter" && e.currentTarget.value.trim() && onAdd({ col, value: e.currentTarget.value.trim() })} />
        </>
      )}
    </Popover>
  );
}

function DatabaseView({ databaseId, editable }: { databaseId: string; editable: boolean }) {
  const [db, setDb] = useState<Database | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [filtering, setFiltering] = useState(false);
  const filterBtn = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const r = editable ? await loadEditable(databaseId) : await loadPublic(databaseId);
      if (!r.database) throw new Error("Database not found");
      setDb({ ...r.database, view: r.database.view ?? {} });
      setRows(r.rows.map((x) => ({ ...x, properties: x.properties ?? {} })));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [databaseId, editable]);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const dbRef = useRef(db);
  dbRef.current = db;

  const saveColumns = useCallback(
    (columns: Column[]) => {
      setDb((d) => (d ? { ...d, columns } : d));
      api(`/databases/${databaseId}`, { method: "PATCH", body: JSON.stringify({ columns }) }).catch(() => {});
    },
    [databaseId],
  );

  const setView = useCallback(
    (view: DbView) => {
      setDb((d) => (d ? { ...d, view } : d));
      if (editable) api(`/databases/${databaseId}`, { method: "PATCH", body: JSON.stringify({ view }) }).catch(() => {});
    },
    [databaseId, editable],
  );

  const shown = useMemo(() => (db ? rows.filter((r) => (db.view.filters ?? []).every((f) => matches(db, r, f))) : rows), [db, rows]);

  if (error) return <div className="db-empty">{error}</div>;
  if (!db) return <div className="skel skel-block" />;

  const ctx: DbApi = {
    db,
    rows: shown,
    editable,
    saveColumns,
    addOption: (colId, o) => {
      const d = dbRef.current;
      if (!d) return;
      saveColumns(d.columns.map((c) => (c.id === colId ? { ...c, options: [...optionsOf(c), o] } : c)));
    },
    saveRow: (row, patch) => {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
      api(`/notes/${row.id}`, { method: "PATCH", body: JSON.stringify(patch) }).catch(() => {});
    },
    addRow: async (properties = {}) => {
      const row = await api<Row>("/notes", { method: "POST", body: JSON.stringify({ database_id: databaseId, title: "", properties }) });
      const full = { ...row, properties: row.properties ?? properties };
      setRows((rs) => [...rs, full]);
      return full;
    },
    deleteRow: (row, quiet) => {
      setRows((rs) => rs.filter((r) => r.id !== row.id));
      api(`/notes/${row.id}`, { method: "DELETE" }).catch(() => {});
      if (!quiet) toast("Row deleted", {
        label: "Undo",
        run: async () => {
          await api(`/notes/${row.id}/restore`, { method: "POST" }).catch(() => {});
          load();
        },
      });
    },
    openRow: setOpenRow,
    setView,
  };

  const layout = db.view.layout ?? "table";
  const filters = db.view.filters ?? [];
  const colName = (id: string) => (id === "title" ? "Name" : db.columns.find((c) => c.id === id)?.name ?? "?");

  // A board needs a select/status column; a calendar needs a date column. Offer to add one.
  function ensure(kind: "board" | "calendar") {
    const has = db!.columns.find((c) => (kind === "board" ? c.type === "select" || c.type === "status" : c.type === "date"));
    if (has || !editable) return setView({ ...db!.view, layout: kind });
    const col: Column = kind === "board" ? { id: newId(), name: "Status", type: "status", options: optionsOf({ id: "", name: "", type: "status" }) } : { id: newId(), name: "Date", type: "date" };
    saveColumns([...db!.columns, col]);
    setView({ ...db!.view, layout: kind, [kind === "board" ? "groupBy" : "dateBy"]: col.id });
  }

  return (
    <div className="db" contentEditable={false} onKeyDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
      <div className="db-bar">
        <div className="db-views">
          {(["table", "board", "calendar", "gallery"] as const).map((l) => (
            <button key={l} className={layout === l ? "on" : ""} onClick={() => (l === "board" || l === "calendar" ? ensure(l) : setView({ ...db.view, layout: l }))}>
              {l[0].toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>
        <div className="db-tools">
          {filters.map((f, i) => (
            <span key={i} className="db-chip">
              {colName(f.col)}: {f.value}
              <button onClick={() => setView({ ...db.view, filters: filters.filter((_, j) => j !== i) })} aria-label="Remove filter">×</button>
            </span>
          ))}
          <span className="db-tool-wrap">
            <button ref={filterBtn} className="db-tool" onClick={() => setFiltering(!filtering)}>Filter</button>
            {filtering && (
              <FilterMenu
                anchor={filterBtn.current}
                db={db}
                onClose={() => setFiltering(false)}
                onAdd={(f) => {
                  setFiltering(false);
                  setView({ ...db.view, filters: [...filters, f] });
                }}
              />
            )}
          </span>
        </div>
      </div>
      {layout === "board" ? <BoardView {...ctx} /> : layout === "calendar" ? <CalendarView {...ctx} /> : layout === "gallery" ? <GalleryView {...ctx} /> : <TableView {...ctx} />}
      {openRow && (
        <RowPanel
          rowId={openRow}
          columns={db.columns}
          onAddOption={ctx.addOption}
          onClose={() => {
            setOpenRow(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export const DatabaseBlock = createReactBlockSpec(
  {
    type: "database",
    propSchema: { databaseId: { default: "" } },
    content: "none",
  },
  {
    render: ({ block, editor }) =>
      block.props.databaseId ? (
        <DatabaseView databaseId={block.props.databaseId} editable={editor.isEditable} />
      ) : (
        <div className="db-empty">Empty database</div>
      ),
    toExternalHTML: () => <p>[Database]</p>,
  },
);
