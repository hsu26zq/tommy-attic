"use client";
import { useEffect, useRef, useState } from "react";

// Hover a column → a small handle on its top edge. Drag it left or right to move the whole column:
// it follows the mouse and the other columns slide aside (positions are read once, so nothing chases the mouse).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ed = any;
type Box = { rowId: string; index: number; left: number; top: number; width: number };

export default function ColumnMover({ editor }: { editor: Ed }) {
  const [hover, setHover] = useState<Box | null>(null);
  const drag = useRef<{ rowId: string; from: number; to: number; x: number; boxes: { left: number; width: number }[] } | null>(null);
  const slide = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    const root = () => editor?.domElement as HTMLElement | undefined;

    let raf = 0;
    function move(e: MouseEvent) {
      const d = drag.current;
      if (d) {
        // the dragged column's middle, from where it started
        const me = d.boxes[d.from];
        const mid = me.left + me.width / 2 + (e.clientX - d.x);
        // its new place: count the other columns whose middle it has passed
        const to = d.boxes.filter((b, i) => i !== d.from && b.left + b.width / 2 < mid).length;
        d.to = to;
        const id = CSS.escape(d.rowId);
        const rules = [`.bn-block-column-list[data-id="${id}"] > .bn-block-column:nth-child(${d.from + 1}) { transform: translateX(${e.clientX - d.x}px); pointer-events: none; z-index: 5; background: var(--bg); box-shadow: 0 6px 20px rgba(0,0,0,0.12); border-radius: 6px; transition: none; }`];
        d.boxes.forEach((b, i) => {
          if (i === d.from) return;
          const shift = d.from < to && i > d.from && i <= to ? -me.width : d.from > to && i >= to && i < d.from ? me.width : 0;
          rules.push(`.bn-block-column-list[data-id="${id}"] > .bn-block-column:nth-child(${i + 1}) { transform: translateX(${shift}px); transition: transform 0.15s ease; }`);
        });
        if (slide.current) slide.current.textContent = rules.join("\n");
        return;
      }
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if ((e.target as HTMLElement | null)?.closest(".col-move")) return;
        const col = (e.target as HTMLElement | null)?.closest<HTMLElement>(".bn-block-column");
        const rowEl = col?.parentElement;
        if (!col || !rowEl?.classList.contains("bn-block-column-list") || !root()?.contains(rowEl)) return setHover(null);
        const b = col.getBoundingClientRect();
        setHover({ rowId: rowEl.dataset.id ?? "", index: [...rowEl.children].indexOf(col), left: b.left + window.scrollX, top: b.top + window.scrollY, width: b.width });
      });
    }
    function up() {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      if (slide.current) slide.current.textContent = "";
      document.body.classList.remove("col-moving");
      const row = editor.getBlock(d.rowId);
      if (!row) return;
      const to = d.to;
      if (to === d.from) return;
      const kids = [...row.children];
      const [moved] = kids.splice(d.from, 1);
      kids.splice(to, 0, moved);
      editor.updateBlock(row, { children: kids });
      setHover(null);
    }
    const st = document.createElement("style");
    document.head.appendChild(st);
    slide.current = st;
    document.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      st.remove();
      document.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      cancelAnimationFrame(raf);
    };
  }, [editor]);

  if (!editor?.isEditable) return null;
  return (
    <>
      {hover && (
        <button
          className="col-move"
          title="Drag to move this column"
          aria-label="Move column"
          style={{ left: hover.left + hover.width / 2 - 13, top: hover.top - 4 }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const boxes = [...(document.querySelectorAll<HTMLElement>(`.bn-block-column-list[data-id="${CSS.escape(hover.rowId)}"] > .bn-block-column`) ?? [])].map((c) => {
              const b = c.getBoundingClientRect();
              return { left: b.left, width: b.width };
            });
            drag.current = { rowId: hover.rowId, from: hover.index, to: hover.index, x: e.clientX, boxes };
            document.body.classList.add("col-moving");
          }}
        >
          <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden>
            {[2, 8, 14].flatMap((x) => [2, 6].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}
          </svg>
        </button>
      )}
    </>
  );
}
