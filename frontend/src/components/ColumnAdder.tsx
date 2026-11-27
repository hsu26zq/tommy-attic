"use client";
import { useEffect, useState } from "react";

// Hover a columns row → a small "+" on its right edge adds one more column.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function ColumnAdder({ editor }: { editor: any }) {
  const [at, setAt] = useState<{ id: string; top: number; left: number; height: number } | null>(null);

  useEffect(() => {
    let raf = 0;
    function move(e: MouseEvent) {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const t = e.target as HTMLElement | null;
        if (t?.closest(".col-add")) return;
        const root = editor?.domElement as HTMLElement | undefined;
        const row = root ? [...root.querySelectorAll<HTMLElement>(".bn-block-column-list")].find((r) => {
          const b = r.getBoundingClientRect();
          return e.clientY >= b.top && e.clientY <= b.bottom && e.clientX >= b.left && e.clientX <= b.right + 36;
        }) : undefined;
        if (!row) return setAt(null);
        const b = row.getBoundingClientRect();
        setAt({ id: row.dataset.id ?? "", top: b.top + window.scrollY, left: b.right + window.scrollX + 6, height: b.height });
      });
    }
    document.addEventListener("mousemove", move);
    return () => {
      document.removeEventListener("mousemove", move);
      cancelAnimationFrame(raf);
    };
  }, [editor]);

  if (!at || !editor?.isEditable) return null;
  function add() {
    const row = editor.getBlock(at!.id);
    if (!row) return;
    editor.updateBlock(row, { children: [...row.children, { type: "column", children: [{ type: "paragraph" }] }] });
    setAt(null);
  }
  return (
    <button
      className="col-add"
      title="Add a column"
      aria-label="Add a column"
      style={{ top: at.top, left: at.left, height: at.height }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={add}
    >
      +
    </button>
  );
}
