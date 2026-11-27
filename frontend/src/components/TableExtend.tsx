"use client";
import { EMPTY_CELL_HEIGHT, EMPTY_CELL_WIDTH } from "@blocknote/core";
import { TableHandlesExtension } from "@blocknote/core/extensions";
import { useBlockNoteEditor, useExtension, useExtensionState, type ExtendButtonProps } from "@blocknote/react";
import { useEffect, useRef, useState, type MouseEvent as RME } from "react";

// Edge bars on a table: drag the bottom bar for rows, the right bar for columns,
// the corner for either or both (it follows the way you drag). Drag back to remove — only empty rows/columns go.
const round = (n: number) => (n >= 0 ? Math.floor(n + 0.3) : Math.ceil(n - 0.3));

type Axis = "rows" | "columns";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Content = any;

export default function TableExtend(props: ExtendButtonProps) {
  const editor = useBlockNoteEditor();
  const handles = useExtension(TableHandlesExtension);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const block = useExtensionState(TableHandlesExtension, { selector: (s: any) => s?.block }) as any;
  const blockRef = useRef(block);
  blockRef.current = block;
  const [drag, setDrag] = useState<{ axes: Axis[]; x: number; y: number; orig: Content } | null>(null);

  function start(e: RME, axes: Axis[]) {
    if (!block) return;
    e.preventDefault();
    e.stopPropagation();
    handles.freezeHandles();
    props.hideOtherElements(true);
    setDrag({ axes, x: e.clientX, y: e.clientY, orig: block.content });
  }

  useEffect(() => {
    if (!drag) return;
    const count = (c: Content, a: Axis) => (a === "rows" ? c.rows.length : (c.rows[0]?.cells.length ?? 0));
    function move(e: MouseEvent) {
      const b = blockRef.current;
      if (!b) return;
      let content: Content = drag!.orig;
      let changed = false;
      for (const a of drag!.axes) {
        const delta = round(a === "rows" ? (e.clientY - drag!.y) / EMPTY_CELL_HEIGHT : (e.clientX - drag!.x) / EMPTY_CELL_WIDTH);
        const tbl = { type: "table", content } as Content;
        const cropped = { ...content, rows: handles.cropEmptyRowsOrColumns(tbl, a) };
        const want = Math.max(1, count(content, a) + delta, count(cropped, a));
        content = { ...content, rows: handles.addRowsOrColumns({ type: "table", content: cropped } as Content, a, want - count(cropped, a)) };
        if (count(content, a) !== count(b.content, a)) changed = true;
      }
      if (!changed) return;
      editor.updateBlock(b, { type: "table", content } as Content);
      try {
        editor.setTextCursorPosition(b);
      } catch {}
    }
    function up() {
      props.hideOtherElements(false);
      handles.unfreezeHandles();
      setDrag(null);
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [drag, editor, handles, props]);

  if (!editor.isEditable) return null;
  const rows = props.orientation === "addOrRemoveRows";
  return (
    <div
      className={`tbl-edge ${rows ? "tbl-edge-rows" : "tbl-edge-cols"} ${drag ? "dragging" : ""}`}
      title={rows ? "Drag to add or remove rows" : "Drag to add or remove columns"}
      onMouseDown={(e) => start(e, [rows ? "rows" : "columns"])}
    >
      {rows && <span className="tbl-corner" title="Drag to add rows and columns" onMouseDown={(e) => start(e, ["rows", "columns"])} />}
    </div>
  );
}
