"use client";
import { useEffect, useRef, useState } from "react";
import Popover from "./Popover";
import type { Column, ColumnOption, OptionColor } from "@/lib/api";

export const OPTION_COLORS: OptionColor[] = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];
export const STATUS_DEFAULT: ColumnOption[] = [
  { name: "Not started", color: "gray" },
  { name: "In progress", color: "blue" },
  { name: "Done", color: "green" },
];

export const optionsOf = (c: Column): ColumnOption[] => c.options ?? (c.type === "status" ? STATUS_DEFAULT : []);
const colorOf = (c: Column, name: string) => optionsOf(c).find((o) => o.name === name)?.color ?? "gray";

export function Pill({ column, name }: { column: Column; name: string }) {
  return <span className={`pill opt-${colorOf(column, name)} ${column.type === "status" ? "status" : ""}`}>{name}</span>;
}

// Pick one option (select / status), or several (tags). Type to find or make a new one.
function OptionPicker({
  anchor,
  column,
  value,
  onSave,
  onAddOption,
  onClose,
}: {
  anchor: HTMLElement | null;
  column: Column;
  value: unknown;
  onSave: (v: unknown) => void;
  onAddOption?: (o: ColumnOption) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const many = column.type === "tags";
  const chosen: string[] = many ? (Array.isArray(value) ? value.map(String) : []) : value ? [String(value)] : [];
  const known = optionsOf(column);
  // Tags typed before options existed still show up as choices
  const all = [...known, ...chosen.filter((n) => !known.some((o) => o.name === n)).map((name) => ({ name, color: "gray" as OptionColor }))];
  const list = all.filter((o) => o.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = all.some((o) => o.name.toLowerCase() === q.trim().toLowerCase());
  function pick(name: string) {
    if (many) onSave(chosen.includes(name) ? chosen.filter((n) => n !== name) : [...chosen, name]);
    else {
      onSave(chosen[0] === name ? null : name);
      onClose();
    }
  }

  function create() {
    const name = q.trim();
    if (!name) return;
    const color = OPTION_COLORS[(known.length + 1) % OPTION_COLORS.length];
    onAddOption?.({ name, color });
    setQ("");
    pick(name);
  }

  return (
    <Popover anchor={anchor} onClose={onClose} align="over" className="opt-picker">
      <input
        autoFocus
        value={q}
        placeholder={known.length ? "Find or make an option" : "Type to make an option"}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (list.length === 1 && exact) pick(list[0].name);
            else if (!exact) create();
          }
          if (e.key === "Escape") onClose();
        }}
      />
      <div className="opt-list">
        {list.map((o) => (
          <button key={o.name} className={chosen.includes(o.name) ? "on" : ""} onClick={() => pick(o.name)}>
            <span className={`pill opt-${o.color} ${column.type === "status" ? "status" : ""}`}>{o.name}</span>
            {chosen.includes(o.name) && <span className="opt-check">✓</span>}
          </button>
        ))}
        {q.trim() && !exact && (
          <button onClick={create}>
            <span className="muted small">Make</span> <span className="pill opt-gray">{q.trim()}</span>
          </button>
        )}
      </div>
    </Popover>
  );
}

// One property value, edited in place.
export function PropertyCell({
  column,
  value,
  editable,
  onSave,
  onAddOption,
}: {
  column: Column;
  value: unknown;
  editable: boolean;
  onSave: (v: unknown) => void;
  onAddOption?: (o: ColumnOption) => void;
}) {
  const [draft, setDraft] = useState(toText(column, value));
  const [picking, setPicking] = useState(false);
  const pickRef = useRef<HTMLButtonElement>(null);
  useEffect(() => setDraft(toText(column, value)), [column, value]);

  if (column.type === "checkbox") {
    return <input type="checkbox" className="cell-check" checked={!!value} disabled={!editable} onChange={(e) => onSave(e.target.checked)} />;
  }

  if (!editable) return <span className="cell-read">{render(column, value)}</span>;

  if (column.type === "select" || column.type === "status" || column.type === "tags") {
    return (
      <div className="cell-edit">
        <button ref={pickRef} className="cell-pick" onClick={() => setPicking(true)}>
          {render(column, value) ?? <span className="cell-empty">Empty</span>}
        </button>
        {picking && <OptionPicker anchor={pickRef.current} column={column} value={value} onSave={onSave} onAddOption={onAddOption} onClose={() => setPicking(false)} />}
      </div>
    );
  }

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
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {column.type === "url" && draft && <span className="cell-preview">{render(column, fromText(column, draft))}</span>}
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
  return t;
}

// Plain words for a value (used by filters and search)
export function valueText(column: Column, v: unknown): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join(" ");
  if (column.type === "checkbox") return v ? "yes" : "no";
  return String(v);
}

export function render(column: Column, v: unknown) {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return null;
  if (column.type === "tags") {
    const list = Array.isArray(v) ? v : [v];
    return (
      <span className="tags">
        {list.map((t) => <Pill key={String(t)} column={column} name={String(t)} />)}
      </span>
    );
  }
  if (column.type === "select" || column.type === "status") return <Pill column={column} name={String(v)} />;
  if (column.type === "url") {
    const href = /^https?:\/\//.test(String(v)) ? String(v) : `https://${v}`;
    return (
      <a href={href} target="_blank" rel="noreferrer" className="cell-link" onMouseDown={(e) => e.stopPropagation()}>
        {String(v).replace(/^https?:\/\//, "")}
      </a>
    );
  }
  if (column.type === "checkbox") return v ? "✓" : null;
  if (column.type === "date") {
    const d = new Date(`${v}T00:00:00`);
    return isNaN(d.getTime()) ? String(v) : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }
  return String(v);
}
