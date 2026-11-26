"use client";
import { useState } from "react";
import type { Column, Row } from "@/lib/api";
import { optionsOf, render } from "./PropertyCell";
import type { DbApi } from "./shared";

// Cards in columns, one column per option. Drag a card to change its value.
export default function BoardView({ db, rows, editable, saveRow, addRow, openRow, setView }: DbApi) {
  const groupCols = db.columns.filter((c) => c.type === "select" || c.type === "status");
  const group = groupCols.find((c) => c.id === db.view.groupBy) ?? groupCols[0];
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  if (!group) return <div className="db-empty">Add a Select or Status column to group cards.</div>;

  const lanes = [...optionsOf(group).map((o) => ({ key: o.name, label: o.name, color: o.color })), { key: "", label: "No value", color: "gray" as const }];
  const laneOf = (r: Row) => {
    const v = r.properties[group.id];
    return typeof v === "string" && lanes.some((l) => l.key === v) ? v : "";
  };
  const shown = db.columns.filter((c) => c.id !== group.id && c.type !== "checkbox").slice(0, 3);
  const sorted = [...rows].sort((a, b) => a.position - b.position);

  function move(lane: string) {
    const row = rows.find((r) => r.id === dragId);
    setDragId(null);
    setOver(null);
    if (row && laneOf(row) !== lane) saveRow(row, { properties: { ...row.properties, [group.id]: lane || null } });
  }

  return (
    <>
      {groupCols.length > 1 && (
        <div className="db-sub">
          Group by
          <select value={group.id} onChange={(e) => setView({ ...db.view, groupBy: e.target.value })}>
            {groupCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      <div className="board">
        {lanes.map((l) => {
          const cards = sorted.filter((r) => laneOf(r) === l.key);
          if (!l.key && !cards.length && !dragId) return null;
          return (
            <div
              key={l.key || "_none"}
              className={`lane ${over === l.key ? "over" : ""}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (over !== l.key) setOver(l.key);
              }}
              onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                move(l.key);
              }}
            >
              <div className="lane-head">
                <span className={`pill opt-${l.color} ${group.type === "status" ? "status" : ""}`}>{l.label}</span>
                <span className="lane-count">{cards.length}</span>
              </div>
              {cards.map((r) => (
                <div
                  key={r.id}
                  className={`card ${dragId === r.id ? "dragging" : ""}`}
                  draggable={editable}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", r.id);
                    setDragId(r.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOver(null);
                  }}
                  onClick={() => openRow(r.id)}
                >
                  <div className="card-title">{r.icon ? `${r.icon} ` : ""}{r.title || "Untitled"}</div>
                  {shown.map((c: Column) => {
                    const v = render(c, r.properties[c.id]);
                    return v ? <div key={c.id} className="card-prop">{v}</div> : null;
                  })}
                </div>
              ))}
              {editable && (
                <button className="lane-new" onClick={async () => openRow((await addRow(l.key ? { [group.id]: l.key } : {})).id)}>
                  + New
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
