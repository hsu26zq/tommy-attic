"use client";
import Link from "next/link";
import type { Column, ColumnOption } from "@/lib/api";
import NoteEditor from "../NoteEditor";
import { PropertyCell } from "./PropertyCell";

// A database row opened on the side: properties on top, a full page below.
export default function RowPanel({ rowId, columns, onClose, onAddOption }: { rowId: string; columns: Column[]; onClose: () => void; onAddOption?: (colId: string, o: ColumnOption) => void }) {
  return (
    <div className="panel-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="panel">
        <NoteEditor
          id={rowId}
          header={() => (
            <div className="panel-bar">
              <button className="icon-btn" onClick={onClose} title="Close">✕</button>
              <Link href={`/edit/${rowId}`} className="ghost-link">Open as page</Link>
            </div>
          )}
          beforeEditor={({ note, change }) =>
            columns.length ? (
              <div className="props">
                {columns.map((c) => (
                  <div key={c.id} className="prop">
                    <span className="prop-name">{c.name}</span>
                    <PropertyCell
                      column={c}
                      value={note.properties?.[c.id]}
                      editable
                      onSave={(v) => change({ properties: { ...note.properties, [c.id]: v } })}
                      onAddOption={(o) => onAddOption?.(c.id, o)}
                    />
                  </div>
                ))}
              </div>
            ) : null
          }
        />
      </aside>
    </div>
  );
}
