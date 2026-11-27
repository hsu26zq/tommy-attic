"use client";
import { useEffect, useRef, useState } from "react";

// Columns rows:
// - hover → a bar on the right edge: drag it to make the whole row wider (up to the screen edge), "+" adds a column
// - dragging the line between two columns snaps to halves, thirds and quarters
// How much wider a row is gets stored in its columns' widths: only their ratio sets each column's share,
// so their sum is free — sum ÷ number of columns = how many page-widths wide the row is (1 = normal).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ed = any;
type Col = { id: string; props: { width?: number }; children: unknown[] };

const widthsOf = (row: { children: Col[] }) => row.children.map((c) => Number(c.props?.width) || 1);
const factorOf = (row: { children: Col[] }) => {
  const w = widthsOf(row);
  return Math.max(1, w.reduce((a, b) => a + b, 0) / w.length);
};
const maxRight = () => window.innerWidth - 40;

export default function ColumnAdder({ editor }: { editor: Ed }) {
  const [at, setAt] = useState<{ id: string; top: number; left: number; height: number } | null>(null);
  const style = useRef<HTMLStyleElement | null>(null);
  const live = useRef<Record<string, number>>({}); // row id → width in px while dragging

  useEffect(() => {
    const st = document.createElement("style");
    document.head.appendChild(st);
    style.current = st;
    const root = () => editor?.domElement as HTMLElement | undefined;

    // widen rows through a style rule (changing the editor's own elements would make it redraw them)
    function layout() {
      const el = root();
      if (!el) return;
      const rules: string[] = [];
      for (const rowEl of el.querySelectorAll<HTMLElement>(".bn-block-column-list")) {
        const id = rowEl.dataset.id ?? "";
        const row = editor.getBlock(id);
        if (!row) continue;
        const base = rowEl.parentElement?.getBoundingClientRect().width ?? 0;
        const left = rowEl.getBoundingClientRect().left;
        const want = live.current[id] ?? factorOf(row) * base;
        const w = Math.max(base, Math.min(want, maxRight() - left));
        if (w > base + 1) rules.push(`.bn-block-column-list[data-id="${CSS.escape(id)}"] { width: ${Math.round(w)}px; max-width: none; }`);
      }
      st.textContent = rules.join("\n");
    }
    layout();
    const off = editor?.onChange?.(() => requestAnimationFrame(layout));
    window.addEventListener("resize", layout);

    // hover: where the edge bar goes
    let raf = 0;
    function move(e: MouseEvent) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if ((e.target as HTMLElement | null)?.closest(".col-edge") || drag) return;
        const el = root();
        const rowEl = el
          ? [...el.querySelectorAll<HTMLElement>(".bn-block-column-list")].find((r) => {
              const b = r.getBoundingClientRect();
              return e.clientY >= b.top && e.clientY <= b.bottom && e.clientX >= b.left && e.clientX <= b.right + 36;
            })
          : undefined;
        if (!rowEl) return setAt(null);
        const b = rowEl.getBoundingClientRect();
        setAt({ id: rowEl.dataset.id ?? "", top: b.top + window.scrollY, left: b.right + window.scrollX + 6, height: b.height });
      });
    }

    // The line between two columns steps through halves, thirds and quarters (twelfths for 3+ columns):
    // while dragging, the columns are shown at the nearest step; letting go saves that step.
    const snapStyle = document.createElement("style");
    document.head.appendChild(snapStyle);
    function snapped(row: { children: Col[] }) {
      const w = widthsOf(row);
      const sum = w.reduce((a, b) => a + b, 0);
      let share = w.map((x) => x / sum);
      if (share.length === 2) {
        const steps = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];
        const first = steps.reduce((best, s) => (Math.abs(s - share[0]) < Math.abs(best - share[0]) ? s : best));
        share = [first, 1 - first];
      } else {
        share = share.map((s) => Math.max(1, Math.round(s * 12)) / 12);
        const t = share.reduce((a, b) => a + b, 0);
        share = share.map((s) => s / t);
      }
      return { w, next: share.map((s) => s * sum) };
    }
    let resizing: HTMLElement | null = null;
    function down() {
      resizing = document.querySelector<HTMLElement>(".bn-column-resize-border")?.closest<HTMLElement>(".bn-block-column-list") ?? null;
    }
    function resizeMove() {
      if (!resizing) return;
      const rowEl = resizing;
      requestAnimationFrame(() => {
        const row = editor.getBlock(rowEl.dataset.id ?? "");
        if (!row) return;
        const { next } = snapped(row);
        const id = CSS.escape(rowEl.dataset.id ?? "");
        snapStyle.textContent = next.map((g, i) => `.bn-block-column-list[data-id="${id}"] > .bn-block-column:nth-child(${i + 1}) { flex-grow: ${g} !important; }`).join("\n");
      });
    }
    function up() {
      const rowEl = resizing;
      resizing = null;
      if (!rowEl) return;
      setTimeout(() => {
        snapStyle.textContent = "";
        const row = editor.getBlock(rowEl.dataset.id ?? "");
        if (!row) return;
        const { w, next } = snapped(row);
        if (next.every((x, i) => Math.abs(x - w[i]) < 1e-6)) return;
        editor.updateBlock(row, { children: row.children.map((c: Col, i: number) => ({ ...c, props: { ...c.props, width: next[i] } })) });
      }, 0);
    }

    let drag: { id: string; x: number; start: number; base: number } | null = null;
    function dragMove(e: MouseEvent) {
      if (!drag) return;
      // the whole row steps in quarter-page widths
      const raw = Math.max(drag.base, drag.start + e.clientX - drag.x);
      live.current[drag.id] = drag.base * (1 + Math.round((raw / drag.base - 1) * 4) / 4);
      layout();
      const rowEl = root()?.querySelector<HTMLElement>(`.bn-block-column-list[data-id="${CSS.escape(drag.id)}"]`);
      if (rowEl) {
        const b = rowEl.getBoundingClientRect();
        setAt({ id: drag.id, top: b.top + window.scrollY, left: b.right + window.scrollX + 6, height: b.height });
      }
    }
    function dragUp() {
      if (!drag) return;
      const { id, base } = drag;
      drag = null;
      document.body.classList.remove("col-widening");
      const rowEl = root()?.querySelector<HTMLElement>(`.bn-block-column-list[data-id="${CSS.escape(id)}"]`);
      const row = editor.getBlock(id);
      delete live.current[id];
      if (!row || !rowEl || !base) return layout();
      const f = Math.max(1, Math.round((rowEl.getBoundingClientRect().width / base) * 4) / 4);
      const scale = f / factorOf(row);
      if (Math.abs(scale - 1) < 0.01) return layout();
      editor.updateBlock(row, { children: row.children.map((c: Col) => ({ ...c, props: { ...c.props, width: (Number(c.props?.width) || 1) * scale } })) });
    }
    // started from the edge bar (below)
    startDrag.current = (e: React.MouseEvent, id: string) => {
      const rowEl = root()?.querySelector<HTMLElement>(`.bn-block-column-list[data-id="${CSS.escape(id)}"]`);
      if (!rowEl) return;
      e.preventDefault();
      drag = { id, x: e.clientX, start: rowEl.getBoundingClientRect().width, base: rowEl.parentElement?.getBoundingClientRect().width ?? 0 };
      document.body.classList.add("col-widening");
    };

    document.addEventListener("mousemove", move);
    document.addEventListener("mousemove", resizeMove);
    document.addEventListener("mousedown", down, true);
    document.addEventListener("mouseup", up, true);
    window.addEventListener("mousemove", dragMove);
    window.addEventListener("mouseup", dragUp);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mousemove", resizeMove);
      snapStyle.remove();
      document.removeEventListener("mousedown", down, true);
      document.removeEventListener("mouseup", up, true);
      window.removeEventListener("mousemove", dragMove);
      window.removeEventListener("mouseup", dragUp);
      window.removeEventListener("resize", layout);
      if (typeof off === "function") off();
      cancelAnimationFrame(raf);
      st.remove();
    };
  }, [editor]);

  const startDrag = useRef<(e: React.MouseEvent, id: string) => void>(() => {});

  if (!at || !editor?.isEditable) return null;
  function add() {
    const row = editor.getBlock(at!.id);
    if (!row) return;
    // the new column gets the average width, so the row keeps its overall width
    const w = widthsOf(row);
    const avg = w.reduce((a, b) => a + b, 0) / w.length;
    editor.updateBlock(row, { children: [...row.children, { type: "column", props: { width: avg }, children: [{ type: "paragraph" }] }] });
    setAt(null);
  }
  return (
    <div
      className="col-edge"
      title="Drag to make the columns wider"
      style={{ top: at.top, left: at.left, height: at.height }}
      onMouseDown={(e) => {
        if ((e.target as HTMLElement).closest(".col-add")) return;
        startDrag.current(e, at.id);
      }}
    >
      <button className="col-add" title="Add a column" aria-label="Add a column" onMouseDown={(e) => e.preventDefault()} onClick={add}>
        +
      </button>
    </div>
  );
}
