"use client";
import { EMPTY_CELL_HEIGHT, EMPTY_CELL_WIDTH } from "@blocknote/core";
import { TableHandlesExtension } from "@blocknote/core/extensions";
import { TableHandle, useBlockNoteEditor, useExtension, useExtensionState, type ExtendButtonProps, type TableHandleProps } from "@blocknote/react";
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

  // A table wider than the page scrolls sideways; keep the bars on its visible edge, not its far-off real edge.
  const [, redraw] = useState(0);
  const wrap = block ? document.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(block.id)}"] .tableWrapper`) : null;
  useEffect(() => {
    if (!wrap) return;
    const on = () => redraw((n) => n + 1);
    wrap.addEventListener("scroll", on, { passive: true });
    return () => wrap.removeEventListener("scroll", on);
  }, [wrap]);
  const table = wrap?.querySelector("table");
  let shift = 0; // how far the table's real right edge is past the visible one
  let lead = 0; // how much of the table is scrolled off to the left
  let visibleW: number | undefined;
  if (wrap && table) {
    const w = wrap.getBoundingClientRect();
    const t = table.getBoundingClientRect();
    const right = w.right - (parseFloat(getComputedStyle(wrap).paddingRight) || 0);
    shift = Math.max(0, t.right - right);
    lead = Math.max(0, w.left - t.left);
    visibleW = Math.max(40, Math.min(t.right, right) - Math.max(t.left, w.left));
  }

  if (!editor.isEditable) return null;
  const rows = props.orientation === "addOrRemoveRows";
  return (
    <div
      style={shift || lead ? (rows ? { width: visibleW, transform: `translateX(${lead}px)` } : { transform: `translateX(${-shift}px)` }) : undefined}
      className={`tbl-edge ${rows ? "tbl-edge-rows" : "tbl-edge-cols"} ${drag ? "dragging" : ""}`}
      title={rows ? "Drag to add or remove rows" : "Drag to add or remove columns"}
      onMouseDown={(e) => start(e, [rows ? "rows" : "columns"])}
    >
      {rows && <span className="tbl-corner" title="Drag to add rows and columns" onMouseDown={(e) => start(e, ["rows", "columns"])} />}
    </div>
  );
}

// While a table row or column is dragged by its handle, that row/column follows the mouse.
// It lets the mouse "see through" it, so the editor still finds the row/column underneath as the drop spot.
export function TableDragPreview() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = useExtensionState(TableHandlesExtension, { selector: (st: any) => (st?.draggingState ? { ...st.draggingState, blockId: st.block?.id as string } : null) }) as
    | { draggedCellOrientation: "row" | "col"; originalIndex: number; mousePos: number; blockId: string }
    | null;
  const origin = useRef<{ key: string; center: number } | null>(null);
  const style = useRef<HTMLStyleElement | null>(null);
  useEffect(() => {
    const st = document.createElement("style");
    document.head.appendChild(st);
    style.current = st;
    return () => st.remove();
  }, []);
  useEffect(() => {
    const st = style.current;
    if (!st) return;
    if (!s) {
      origin.current = null;
      st.textContent = "";
      return;
    }
    const scope = `.bn-block-outer[data-id="${CSS.escape(s.blockId)}"] table`;
    const row = s.draggedCellOrientation === "row";
    const key = `${s.blockId}:${s.draggedCellOrientation}:${s.originalIndex}`;
    if (origin.current?.key !== key) {
      const table = document.querySelector(scope);
      const el = row ? table?.querySelectorAll("tr")[s.originalIndex] : table?.querySelector("tr")?.children[s.originalIndex];
      const b = el?.getBoundingClientRect();
      origin.current = { key, center: b ? (row ? b.top + b.height / 2 : b.left + b.width / 2) : s.mousePos };
    }
    const d = Math.round(s.mousePos - origin.current.center);
    const sel = row ? `${scope} tr:nth-child(${s.originalIndex + 1}) > *` : `${scope} tr > :nth-child(${s.originalIndex + 1})`;
    st.textContent = `${sel} { transform: ${row ? `translateY(${d}px)` : `translateX(${d}px)`}; pointer-events: none; position: relative; z-index: 5; background: var(--bg); box-shadow: 0 4px 14px rgba(0,0,0,0.12); opacity: 0.92; }`;
  }, [s]);
  return null;
}

// Table row/column handle with smooth dragging: the dragged row (or column) follows the mouse and the others
// slide aside. Positions are read once when the drag starts, and the drop spot is worked out from them,
// so it always lands where the gap is. A plain click still opens the handle's menu.
export function SmoothTableHandle(props: TableHandleProps) {
  const editor = useBlockNoteEditor();
  const handles = useExtension(TableHandlesExtension);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state = useExtensionState(TableHandlesExtension, { selector: (s: any) => ({ block: s?.block, row: s?.rowIndex as number | undefined, col: s?.colIndex as number | undefined }) }) as {
    block: Content;
    row?: number;
    col?: number;
  };
  const stateRef = useRef(state);
  stateRef.current = state;
  const suppressClick = useRef(false);
  const custom = useRef(false); // this press is ours (not the browser's drag)

  function down(e: RME) {
    custom.current = false;
    if (e.button !== 0) return;
    const { block, row, col } = stateRef.current;
    const isRow = props.orientation === "row";
    const index = isRow ? row : col;
    if (!block || index === undefined) return;
    // merged cells: leave it to the editor's own dragging
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const merged = block.content.rows.some((r: any) => r.cells.some((c: any) => c?.props && ((c.props.colspan ?? 1) > 1 || (c.props.rowspan ?? 1) > 1)));
    if (merged) return;
    const table = document.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(block.id)}"] table`);
    if (!table) return;
    e.preventDefault(); // no browser drag
    custom.current = true;
    const rowsEl = [...table.querySelectorAll("tr")];
    const boxes = (isRow ? rowsEl : [...(rowsEl[0]?.children ?? [])]).map((el) => {
      const b = el.getBoundingClientRect();
      return isRow ? { start: b.top, size: b.height } : { start: b.left, size: b.width };
    });
    const st = document.createElement("style");
    document.head.appendChild(st);
    const scope = `.bn-block-outer[data-id="${CSS.escape(block.id)}"] table`;
    const nth = (i: number) => (isRow ? `${scope} tr:nth-child(${i + 1}) > *` : `${scope} tr > :nth-child(${i + 1})`);
    const startPos = isRow ? e.clientY : e.clientX;
    let dragging = false;
    let to = index;

    function move(ev: MouseEvent) {
      const pos = isRow ? ev.clientY : ev.clientX;
      const d = pos - startPos;
      if (!dragging) {
        if (Math.abs(d) < 4) return;
        dragging = true;
        handles.freezeHandles();
        props.hideOtherElements(true);
        document.body.classList.add(isRow ? "tbl-dragging-row" : "tbl-dragging-col");
      }
      const me = boxes[index!];
      const mid = me.start + me.size / 2 + d;
      to = boxes.filter((b, i) => i !== index && b.start + b.size / 2 < mid).length;
      const axis = isRow ? "translateY" : "translateX";
      const rules = [`${nth(index!)} { transform: ${axis}(${d}px); position: relative; z-index: 6; background: var(--bg); box-shadow: inset 0 0 0 0.5px #ddd, 0 6px 18px rgba(0,0,0,0.14); transition: none; }`];
      boxes.forEach((_, i) => {
        if (i === index) return;
        const shift = index! < to && i > index! && i <= to ? -me.size : index! > to && i >= to && i < index! ? me.size : 0;
        rules.push(`${nth(i)} { transform: ${axis}(${shift}px); transition: transform 0.15s ease; }`);
      });
      st.textContent = rules.join("\n");
    }
    function up() {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      if (!dragging) {
        st.remove();
        return;
      }
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 0);
      document.body.classList.remove("tbl-dragging-row", "tbl-dragging-col");
      handles.unfreezeHandles();
      props.hideOtherElements(false);
      const b = editor.getBlock(block.id) as Content;
      if (b && to !== index) {
        const content = b.content;
        const moveIn = <T,>(arr: T[]) => {
          const a = [...arr];
          const [m] = a.splice(index!, 1);
          a.splice(to, 0, m);
          return a;
        };
        const next = isRow
          ? { ...content, rows: moveIn(content.rows) }
          : {
              ...content,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              rows: content.rows.map((r: any) => ({ ...r, cells: moveIn(r.cells) })),
              columnWidths: content.columnWidths ? moveIn([...content.columnWidths, ...Array(Math.max(0, content.rows[0].cells.length - content.columnWidths.length)).fill(undefined)]) : content.columnWidths,
            };
        editor.updateBlock(b, { type: "table", content: next } as Content);
      }
      // let the rows settle into their new places before removing the slide
      requestAnimationFrame(() => st.remove());
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  return (
    <div
      className="tbl-handle-wrap"
      onMouseDownCapture={down}
      onDragStartCapture={(e) => {
        // our own dragging replaces the browser's (except for tables with merged cells)
        if (custom.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onClickCapture={(e) => {
        if (suppressClick.current) {
          e.stopPropagation();
          e.preventDefault();
        }
      }}
    >
      <TableHandle {...props} />
    </div>
  );
}
