"use client";
import { createReactInlineContentSpec } from "@blocknote/react";

// A date in the text, made by typing "@today", "@tomorrow", "@friday", "@dec 3" or "@2026-12-03".
const pad = (n: number) => String(n).padStart(2, "0");
export const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function dateLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d.getTime())) return iso;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", ...(d.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// What the typed words could mean as dates (empty when they don't look like a date)
export function dateGuesses(query: string): { label: string; iso: string }[] {
  const q = query.trim().toLowerCase();
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const plus = (n: number) => {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  };
  const out: Date[] = [];
  const words: [string, Date][] = [["today", plus(0)], ["tomorrow", plus(1)], ["yesterday", plus(-1)]];
  for (const [w, d] of words) if (q && w.startsWith(q)) out.push(d);
  const day = DAYS.findIndex((w) => q.length >= 2 && (w.startsWith(q) || w.startsWith(q.replace(/^next /, ""))));
  if (day >= 0) out.push(plus(((day - base.getDay() + 7) % 7 || 7) + (q.startsWith("next ") ? 7 : 0)));
  if (!out.length && /\d/.test(q)) {
    const tryParse = (s: string) => {
      const t = Date.parse(s);
      return isNaN(t) ? null : new Date(t);
    };
    const iso = /^\d{4}-\d{1,2}-\d{1,2}$/.test(q) ? new Date(`${q.replace(/-(\d)(?=-|$)/g, "-0$1")}T00:00:00`) : null;
    const d = iso ?? tryParse(`${q} ${base.getFullYear()}`) ?? tryParse(q);
    if (d && !isNaN(d.getTime())) out.push(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  const seen = new Set<string>();
  return out
    .map((d) => ({ iso: isoDay(d), label: dateLabel(isoDay(d)) }))
    .filter((x) => !seen.has(x.iso) && seen.add(x.iso));
}

export const DateMention = createReactInlineContentSpec(
  {
    type: "date",
    propSchema: { date: { default: "" } },
    content: "none",
  },
  {
    render: ({ inlineContent }) => {
      const iso = inlineContent.props.date;
      const past = iso < isoDay(new Date());
      return (
        <span className={`date-chip ${past ? "past" : ""}`} title={iso}>
          {dateLabel(iso)}
        </span>
      );
    },
    toExternalHTML: ({ inlineContent }) => <span>{inlineContent.props.date}</span>,
  },
);
