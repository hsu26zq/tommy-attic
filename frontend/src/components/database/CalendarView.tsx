"use client";
import { useMemo, useState } from "react";
import type { Row } from "@/lib/api";
import type { DbApi } from "./shared";

// A month of days; rows sit on their date. Drag a row to another day, or click a day to add one.
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export default function CalendarView({ db, rows, editable, saveRow, addRow, openRow, setView }: DbApi) {
  const dateCols = db.columns.filter((c) => c.type === "date");
  const dateCol = dateCols.find((c) => c.id === db.view.dateBy) ?? dateCols[0];
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    if (!dateCol) return map;
    for (const r of rows) {
      const v = r.properties[dateCol.id];
      if (typeof v === "string" && v) map.set(v.slice(0, 10), [...(map.get(v.slice(0, 10)) ?? []), r]);
    }
    return map;
  }, [rows, dateCol]);

  if (!dateCol) return <div className="db-empty">Add a Date column to see rows on a calendar.</div>;

  // Weeks start on Monday
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const weeks = days[35].getMonth() !== month.getMonth() ? 5 : 6;
  const today = iso(new Date());
  const undated = rows.filter((r) => !r.properties[dateCol.id]).length;

  function drop(day: string) {
    const row = rows.find((r) => r.id === dragId);
    setDragId(null);
    setOver(null);
    if (row) saveRow(row, { properties: { ...row.properties, [dateCol!.id]: day } });
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <span className="cal-month">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
        {dateCols.length > 1 && (
          <select value={dateCol.id} onChange={(e) => setView({ ...db.view, dateBy: e.target.value })}>
            {dateCols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <span className="cal-nav">
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">‹</button>
          <button onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
          <button onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">›</button>
        </span>
      </div>
      <div className="cal-grid">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {days.slice(0, weeks * 7).map((d) => {
          const key = iso(d);
          const items = byDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`cal-day ${d.getMonth() !== month.getMonth() ? "other" : ""} ${key === today ? "today" : ""} ${over === key ? "over" : ""}`}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (over !== key) setOver(key);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(key);
              }}
              onClick={async (e) => {
                if (!editable || e.target !== e.currentTarget) return;
                openRow((await addRow({ [dateCol.id]: key })).id);
              }}
            >
              <span className="cal-num">{d.getDate()}</span>
              {items.map((r) => (
                <button
                  key={r.id}
                  className={`cal-item ${dragId === r.id ? "dragging" : ""}`}
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
                  {r.icon ? `${r.icon} ` : ""}{r.title || "Untitled"}
                </button>
              ))}
            </div>
          );
        })}
      </div>
      {undated > 0 && <div className="cal-foot">{undated} without a date — see them in Table</div>}
    </div>
  );
}
