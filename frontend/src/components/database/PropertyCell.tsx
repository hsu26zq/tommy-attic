"use client";
import { useEffect, useState } from "react";
import type { Column } from "@/lib/api";

// One property value, edited in place. Saves when you leave the field.
export function PropertyCell({
  column,
  value,
  editable,
  onSave,
}: {
  column: Column;
  value: unknown;
  editable: boolean;
  onSave: (v: unknown) => void;
}) {
  const [draft, setDraft] = useState(toText(column, value));
  useEffect(() => setDraft(toText(column, value)), [column, value]);

  if (column.type === "checkbox") {
    return (
      <input
        type="checkbox"
        className="cell-check"
        checked={!!value}
        disabled={!editable}
        onChange={(e) => onSave(e.target.checked)}
      />
    );
  }

  if (!editable) return <span className="cell-read">{render(column, value)}</span>;

  const commit = () => {
    const next = fromText(column, draft);
    if (JSON.stringify(next) !== JSON.stringify(value ?? null)) onSave(next);
  };

  return (
    <div className="cell-edit">
      <input
        className="cell-input"
        type={column.type === "number" ? "number" : column.type === "date" ? "date" : "text"}
        value={draft}
        placeholder={column.type === "tags" ? "tag, tag" : ""}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {(column.type === "tags" || column.type === "url") && draft && <span className="cell-preview">{render(column, fromText(column, draft))}</span>}
    </div>
  );
}

function toText(column: Column, v: unknown): string {
  if (v == null) return "";
  if (column.type === "tags") return Array.isArray(v) ? v.join(", ") : String(v);
  return String(v);
}

function fromText(column: Column, s: string): unknown {
  const t = s.trim();
  if (!t) return null;
  if (column.type === "number") return Number.isFinite(Number(t)) ? Number(t) : null;
  if (column.type === "tags") return t.split(",").map((x) => x.trim()).filter(Boolean);
  return t;
}

export function render(column: Column, v: unknown) {
  if (v == null || v === "") return null;
  if (column.type === "tags" && Array.isArray(v)) {
    return (
      <span className="tags">
        {v.map((t) => (
          <span key={String(t)} className="tag">{String(t)}</span>
        ))}
      </span>
    );
  }
  if (column.type === "url") {
    const href = /^https?:\/\//.test(String(v)) ? String(v) : `https://${v}`;
    return (
      <a href={href} target="_blank" rel="noreferrer" className="cell-link" onMouseDown={(e) => e.stopPropagation()}>
        {String(v).replace(/^https?:\/\//, "")}
      </a>
    );
  }
  if (column.type === "checkbox") return v ? "✓" : null;
  return String(v);
}
