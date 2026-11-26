"use client";
import { useMemo, useRef, useState } from "react";
import type { ColumnType, Row } from "@/lib/api";
import { PropertyCell, render } from "./PropertyCell";
import { TYPE_LABEL, type DbApi } from "./shared";
import Popover from "./Popover";

const NAME_W = 260;
const COL_W = 170;

export default function TableView({ db, rows, editable, saveColumns, addOption, saveRow, addRow, deleteRow, openRow, setView }: DbApi) {
  // the sort is saved with the database, so it stays when you come back
  const sort = db.view.sort ?? null;
  const setSort = (next: (s: typeof sort) => typeof sort) => setView({ ...db.view, sort: next(sort) ?? undefined });
  const [menu, setMenu] = useState<{ id: string; el: HTMLElement } | null>(null);
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const resizing = useRef<{ id: string; x: number; w: number } | null>(null);

  const sorted = useMemo(() => {
    const base = [...rows].sort((a, b) => a.position - b.position);
    if (!sort) return base;
    const get = (r: Row) => (sort.col === "title" ? r.title : r.properties[sort.col]);
    return base.sort((a, b) => {
      const x = get(a), y = get(b);
      if (x == null || x === "") return 1;
      if (y == null || y === "") return -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [rows, sort]);

  const sortBy = (col: string) => setSort((s) => (s?.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));
  const arrow = (col: string) => (sort?.col === col ? (sort.dir === 1 ? " ↑" : " ↓") : "");
  const widthOf = (id: string, fallback: number) => widths[id] ?? db.columns.find((c) => c.id === id)?.width ?? fallback;

  // Drag a column's right edge to resize it
  function resizeStart(e: React.PointerEvent, id: string, w: number) {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    resizing.current = { id, x: e.clientX, w };
  }
  function resizeMove(e: React.PointerEvent) {
    const r = resizing.current;
    if (!r) return;
    setWidths((ws) => ({ ...ws, [r.id]: Math.round(Math.min(800, Math.max(80, r.w + e.clientX - r.x))) }));
  }
  function resizeEnd() {
    const r = resizing.current;
    resizing.current = null;
    if (!r || r.id === "title" || widths[r.id] == null) return;
    saveColumns(db.columns.map((c) => (c.id === r.id ? { ...c, width: widths[r.id] } : c)));
  }
  const grip = (id: string, w: number) =>
    editable && <span className="col-grip" onPointerDown={(e) => resizeStart(e, id, w)} onPointerMove={resizeMove} onPointerUp={resizeEnd} onClick={(e) => e.stopPropagation()} />;

  // Drag rows by their handle to reorder (when not sorted)
  function dropRow() {
    const d = dropAt, id = dragRow;
    setDragRow(null);
    setDropAt(null);
    if (!d || !id || d.id === id) return;
    const list = sorted.filter((r) => r.id !== id);
    const i = list.findIndex((r) => r.id === d.id);
    const a = d.after ? list[i] : list[i - 1];
    const b = d.after ? list[i + 1] : list[i];
    const position = a && b ? (a.position + b.position) / 2 : a ? a.position + 1 : b ? b.position - 1 : 0;
    const row = rows.find((r) => r.id === id);
    if (row) saveRow(row, { position });
  }

  const nameW = widthOf("title", NAME_W);
  const total = (editable ? 22 + 40 : 0) + nameW + db.columns.reduce((t, c) => t + widthOf(c.id, COL_W), 0);

  return (
    <>
      <div className="db-scroll">
        <table className="db-table" style={{ width: total }}>
          <colgroup>
            {editable && <col style={{ width: 22 }} />}
            <col style={{ width: nameW }} />
            {db.columns.map((c) => <col key={c.id} style={{ width: widthOf(c.id, COL_W) }} />)}
            {editable && <col style={{ width: 40 }} />}
          </colgroup>
          <thead>
            <tr>
              {editable && <th className="db-handle-col" />}
              <th onClick={() => sortBy("title")}>
                <span className="db-th">Name{arrow("title")}</span>
                {grip("title", nameW)}
              </th>
              {db.columns.map((c) => (
                <th key={c.id}>
                  <span className="db-th" onClick={() => sortBy(c.id)}>{c.name}{arrow(c.id)}</span>
                  {editable && <button className="db-th-menu" onClick={(e) => setMenu(menu?.id === c.id ? null : { id: c.id, el: e.currentTarget })}>⋯</button>}
                  {grip(c.id, widthOf(c.id, COL_W))}
                  {menu?.id === c.id && (
                    <Popover anchor={menu.el} onClose={() => setMenu(null)} className="db-menu">
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
                    </Popover>
                  )}
                </th>
              ))}
              {editable && (
                <th className="db-add-col">
                  <button onClick={() => saveColumns([...db.columns, { id: Math.random().toString(36).slice(2, 10), name: "New column", type: "text" }])} title="Add column">+</button>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr
                key={r.id}
                className={`${dragRow === r.id ? "dragging" : ""} ${dropAt?.id === r.id ? (dropAt.after ? "drop-after" : "drop-before") : ""}`}
                onDragOver={(e) => {
                  if (!dragRow) return;
                  e.preventDefault();
                  const b = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const after = e.clientY > b.top + b.height / 2;
                  if (dropAt?.id !== r.id || dropAt.after !== after) setDropAt({ id: r.id, after });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropRow();
                }}
              >
                {editable && (
                  <td className="db-handle-col">
                    {!sort && (
                      <span
                        className="row-handle"
                        draggable
                        title="Drag to move"
                        onDragStart={(e) => {
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", r.id);
                          setDragRow(r.id);
                        }}
                        onDragEnd={() => {
                          setDragRow(null);
                          setDropAt(null);
                        }}
                      >
                        ⋮⋮
                      </span>
                    )}
                  </td>
                )}
                <td>
                  {editable ? (
                    <div className="db-name">
                      <input
                        className="cell-input strong"
                        defaultValue={r.title}
                        placeholder="Untitled"
                        onBlur={(e) => e.target.value !== r.title && saveRow(r, { title: e.target.value })}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      />
                      <button className="db-open" onClick={() => openRow(r.id)}>Open</button>
                      <button className="db-del" onClick={() => deleteRow(r)} title="Delete row">×</button>
                    </div>
                  ) : (
                    <span className="cell-read strong">{r.title || "Untitled"}</span>
                  )}
                </td>
                {db.columns.map((c) => (
                  <td key={c.id}>
                    {editable ? (
                      <PropertyCell
                        column={c}
                        value={r.properties[c.id]}
                        editable
                        onSave={(v) => saveRow(r, { properties: { ...r.properties, [c.id]: v } })}
                        onAddOption={(o) => addOption(c.id, o)}
                      />
                    ) : (
                      <span className="cell-read">{render(c, r.properties[c.id])}</span>
                    )}
                  </td>
                ))}
                {editable && <td />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && <button className="db-new" onClick={() => addRow()}>+ New</button>}
    </>
  );
}
