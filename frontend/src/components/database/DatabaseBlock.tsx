"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { createReactBlockSpec } from "@blocknote/react";
import { api, type Column, type ColumnType, type Database, type Row } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { PropertyCell, render } from "./PropertyCell";

// Database block: a table inside a note. Each row is a note with its own page.
const RowPanel = dynamic(() => import("./RowPanel"), { ssr: false });

const TYPE_LABEL: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  tags: "Tags",
  url: "Link",
  checkbox: "Checkbox",
  date: "Date",
};

async function loadEditable(id: string) {
  return api<{ database: Database; rows: Row[] }>(`/databases/${id}`);
}

// Visitors read public databases straight from the database (security rules allow it).
async function loadPublic(id: string) {
  const sb = supabase();
  const [{ data: database }, { data: rows }] = await Promise.all([
    sb.from("databases").select("*").eq("id", id).maybeSingle(),
    sb.from("notes").select("id,title,icon,properties,position").eq("database_id", id).is("deleted_at", null).order("position"),
  ]);
  return { database: database as Database, rows: (rows ?? []) as Row[] };
}

function DatabaseView({ databaseId, editable }: { databaseId: string; editable: boolean }) {
  const [db, setDb] = useState<Database | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = editable ? await loadEditable(databaseId) : await loadPublic(databaseId);
      if (!r.database) throw new Error("Database not found");
      setDb(r.database);
      setRows(r.rows);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [databaseId, editable]);

  useEffect(() => {
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const get = (r: Row) => (sort.col === "title" ? r.title : r.properties[sort.col]);
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;
      if (y == null) return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, sort]);

  async function saveColumns(columns: Column[]) {
    setDb((d) => (d ? { ...d, columns } : d));
    await api(`/databases/${databaseId}`, { method: "PATCH", body: JSON.stringify({ columns }) });
  }

  async function addColumn() {
    if (!db) return;
    await saveColumns([...db.columns, { id: Math.random().toString(36).slice(2, 10), name: "New column", type: "text" }]);
  }

  async function saveRow(row: Row, patch: { title?: string; properties?: Record<string, unknown> }) {
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, ...patch } : r)));
    await api(`/notes/${row.id}`, { method: "PATCH", body: JSON.stringify(patch) });
  }

  async function addRow() {
    const row = await api<Row>("/notes", { method: "POST", body: JSON.stringify({ database_id: databaseId, title: "" }) });
    setRows((rs) => [...rs, { ...row, properties: row.properties ?? {} }]);
  }

  async function deleteRow(row: Row) {
    if (!confirm(`Delete "${row.title || "Untitled"}"?`)) return;
    setRows((rs) => rs.filter((r) => r.id !== row.id));
    await api(`/notes/${row.id}?forever=1`, { method: "DELETE" });
  }

  if (error) return <div className="db-empty">{error}</div>;
  if (!db) return <div className="db-empty">Loading…</div>;

  const sortBy = (col: string) =>
    setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  const arrow = (col: string) => (sort?.col === col ? (sort.dir === 1 ? " ↑" : " ↓") : "");

  return (
    <div className="db" contentEditable={false} onKeyDown={(e) => e.stopPropagation()}>
      <div className="db-scroll">
        <table className="db-table">
          <thead>
            <tr>
              <th className="db-name-col" onClick={() => sortBy("title")}>Name{arrow("title")}</th>
              {db.columns.map((c) => (
                <th key={c.id}>
                  <span className="db-th" onClick={() => sortBy(c.id)}>{c.name}{arrow(c.id)}</span>
                  {editable && (
                    <button className="db-th-menu" onClick={() => setMenu(menu === c.id ? null : c.id)}>⋯</button>
                  )}
                  {menu === c.id && (
                    <div className="db-menu" onMouseLeave={() => setMenu(null)}>
                      <input
                        defaultValue={c.name}
                        autoFocus
                        onBlur={(e) => saveColumns(db.columns.map((x) => (x.id === c.id ? { ...x, name: e.target.value || "Column" } : x)))}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                      {(Object.keys(TYPE_LABEL) as ColumnType[]).map((t) => (
                        <button key={t} className={c.type === t ? "on" : ""} onClick={() => saveColumns(db.columns.map((x) => (x.id === c.id ? { ...x, type: t } : x)))}>
                          {TYPE_LABEL[t]}
                        </button>
                      ))}
                      <button className="danger" onClick={() => { setMenu(null); saveColumns(db.columns.filter((x) => x.id !== c.id)); }}>
                        Delete column
                      </button>
                    </div>
                  )}
                </th>
              ))}
              {editable && <th className="db-add-col"><button onClick={addColumn} title="Add column">+</button></th>}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.id}>
                <td className="db-name-col">
                  {editable ? (
                    <div className="db-name">
                      <input
                        className="cell-input strong"
                        defaultValue={r.title}
                        placeholder="Untitled"
                        onBlur={(e) => e.target.value !== r.title && saveRow(r, { title: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                      <button className="db-open" onClick={() => setOpenRow(r.id)}>Open</button>
                      <button className="db-del" onClick={() => deleteRow(r)} title="Delete row">×</button>
                    </div>
                  ) : (
                    <span className="strong">{r.title || "Untitled"}</span>
                  )}
                </td>
                {db.columns.map((c) => (
                  <td key={c.id}>
                    {editable ? (
                      <PropertyCell column={c} value={r.properties[c.id]} editable onSave={(v) => saveRow(r, { properties: { ...r.properties, [c.id]: v } })} />
                    ) : (
                      render(c, r.properties[c.id])
                    )}
                  </td>
                ))}
                {editable && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <button className="db-new" onClick={addRow}>+ New</button>}
      {openRow && db && (
        <RowPanel
          rowId={openRow}
          columns={db.columns}
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
