"use client";
import { useEffect, useRef, useState } from "react";

// Hover a column → a small handle on its top edge. Drag it left or right to move the whole column.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ed = any;
type Box = { rowId: string; index: number; left: number; top: number; width: number };

export default function ColumnMover({ editor }: { editor: Ed }) {
  const [hover, setHover] = useState<Box | null>(null);
  const [line, setLine] = useState<{ left: number; top: number; height: number } | null>(null);
  const drag = useRef<{ rowId: string; from: number; to: number } | null>(null);

  useEffect(() => {
    const root = () => editor?.domElement as HTMLElement | undefined;
    const columnsOf = (rowId: string) =>
      [...(root()?.querySelectorAll<HTMLElement>(`.bn-block-column-list[data-id="${CSS.escape(rowId)}"] > .bn-block-column`) ?? [])];

    let raf = 0;
    function move(e: MouseEvent) {
      const d = drag.current;
      if (d) {
        // where would the column land: before the column whose middle is right of the mouse
        const cols = columnsOf(d.rowId);
        let to = cols.findIndex((c) => {
          const b = c.getBoundingClientRect();
          return e.clientX < b.left + b.width / 2;
        });
        if (to < 0) to = cols.length;
        d.to = to;
        const row = cols[0]?.parentElement?.getBoundingClientRect();
        const x = to < cols.length ? cols[to].getBoundingClientRect().left : (cols.at(-1)?.getBoundingClientRect().right ?? 0);
        if (row) setLine({ left: x + window.scrollX - 1, top: row.top + window.scrollY, height: row.height });
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
      setLine(null);
      document.body.classList.remove("col-moving");
      const row = editor.getBlock(d.rowId);
      if (!row) return;
      const to = d.to > d.from ? d.to - 1 : d.to;
      if (to === d.from) return;
      const kids = [...row.children];
      const [moved] = kids.splice(d.from, 1);
      kids.splice(to, 0, moved);
      editor.updateBlock(row, { children: kids });
      setHover(null);
    }
    document.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
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
            drag.current = { rowId: hover.rowId, from: hover.index, to: hover.index };
            document.body.classList.add("col-moving");
          }}
        >
          <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden>
            {[2, 8, 14].flatMap((x) => [2, 6].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.3" fill="currentColor" />))}
          </svg>
        </button>
      )}
      {line && <div className="col-move-line" style={line} />}
    </>
  );
}
