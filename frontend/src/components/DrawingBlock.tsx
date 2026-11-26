"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { getStroke } from "perfect-freehand";

// Apple Pencil / pen / mouse drawing inside a note.
// Strokes are saved in the block itself (so they sync and back up with the note).
// Coordinates use a virtual canvas 1000 units wide, so drawings scale to any screen.

type Point = [number, number, number]; // x, y, pressure
type Stroke = { c: string; s: number; p: Point[] };

const W = 1000;
const COLORS = ["#2b2620", "#2f5fb3", "#c2412d", "#3f7a4a", "#f2c94c"];
const SIZES = [5, 9, 16];

function parse(json: string): Stroke[] {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function pathFor(stroke: Stroke): string {
  const hasPressure = stroke.p.some((pt) => pt[2] !== 0.5);
  const outline = getStroke(stroke.p, {
    size: stroke.s,
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.4,
    simulatePressure: !hasPressure,
    last: true,
  });
  if (!outline.length) return "";
  const d = outline.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0.toFixed(1), y0.toFixed(1), ((x0 + x1) / 2).toFixed(1), ((y0 + y1) / 2).toFixed(1));
      return acc;
    },
    ["M", ...outline[0].map((n) => n.toFixed(1)), "Q"],
  );
  return d.join(" ") + " Z";
}

function Strokes({ strokes, height }: { strokes: Stroke[]; height: number }) {
  return (
    <>
      {strokes.map((s, i) => (
        <path key={i} d={pathFor(s)} fill={s.c} opacity={s.c === "#f2c94c" ? 0.45 : 1} />
      ))}
      <rect x={0} y={0} width={W} height={height} fill="none" />
    </>
  );
}

function DrawingCanvas({
  strokesJson,
  height,
  editable,
  onSave,
}: {
  strokesJson: string;
  height: number;
  editable: boolean;
  onSave: (strokes: string, height: number) => void;
}) {
  const saved = useMemo(() => parse(strokesJson), [strokesJson]);
  const [strokes, setStrokes] = useState<Stroke[]>(saved);
  const [current, setCurrent] = useState<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[0]);
  const [eraser, setEraser] = useState(false);
  const [penOnly, setPenOnly] = useState(false);
  const [h, setH] = useState(height);
  const history = useRef<Stroke[][]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const drawing = useRef(false);

  // Take in changes that arrive from other devices (live sync)
  useEffect(() => {
    if (!drawing.current) setStrokes(saved);
  }, [saved]);
  useEffect(() => setH(height), [height]);

  function toPoint(e: React.PointerEvent): Point {
    const r = svgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * h;
    const pressure = e.pointerType === "pen" ? e.pressure || 0.5 : 0.5;
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(pressure * 100) / 100];
  }

  function commit(next: Stroke[], nextH = h) {
    history.current.push(strokes);
    if (history.current.length > 50) history.current.shift();
    setStrokes(next);
    onSave(JSON.stringify(next), nextH);
  }

  function eraseAt(pt: Point) {
    const r = 12;
    const keep = strokes.filter((s) => !s.p.some(([x, y]) => Math.abs(x - pt[0]) < r && Math.abs(y - pt[1]) < r));
    if (keep.length !== strokes.length) commit(keep);
  }

  function down(e: React.PointerEvent) {
    if (!editable) return;
    if (e.pointerType === "pen" && !penOnly) setPenOnly(true); // palm rejection once a pencil is used
    if (penOnly && e.pointerType === "touch") return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    const pt = toPoint(e);
    if (eraser) eraseAt(pt);
    else setCurrent({ c: color, s: color === "#f2c94c" ? 24 : size, p: [pt] });
  }

  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const pt = toPoint(e);
    if (eraser) return eraseAt(pt);
    setCurrent((cur) => {
      if (!cur) return cur;
      const last = cur.p[cur.p.length - 1];
      if (Math.abs(last[0] - pt[0]) + Math.abs(last[1] - pt[1]) < 1.5) return cur;
      return { ...cur, p: [...cur.p, pt] };
    });
  }

  function up() {
    if (!drawing.current) return;
    drawing.current = false;
    if (current && current.p.length) commit([...strokes, current]);
    setCurrent(null);
  }

  function undo() {
    const prev = history.current.pop();
    if (prev) {
      setStrokes(prev);
      onSave(JSON.stringify(prev), h);
    }
  }

  const display = current ? [...strokes, current] : strokes;

  return (
    <div className="drawing" contentEditable={false} onMouseDown={(e) => editable && e.stopPropagation()}>
      {editable && (
        <div className="drawing-tools">
          {COLORS.map((c) => (
            <button
              key={c}
              title={c === "#f2c94c" ? "Highlighter" : "Pen"}
              className={`swatch ${!eraser && color === c ? "on" : ""}`}
              onClick={() => { setColor(c); setEraser(false); }}
            >
              <span style={{ background: c }} />
            </button>
          ))}
          <span className="sep" />
          {SIZES.map((s) => (
            <button key={s} className={`size ${size === s ? "on" : ""}`} onClick={() => { setSize(s); setEraser(false); }} title={`Size ${s}`}>
              <span style={{ width: s / 1.5 + 2, height: s / 1.5 + 2 }} />
            </button>
          ))}
          <span className="sep" />
          <button className={`tool ${eraser ? "on" : ""}`} onClick={() => setEraser(!eraser)}>Eraser</button>
          <button className="tool" onClick={undo}>Undo</button>
          <button className="tool" onClick={() => strokes.length && confirm("Clear the drawing?") && commit([])}>Clear</button>
          <button className="tool" onClick={() => { const nh = h + 200; setH(nh); onSave(JSON.stringify(strokes), nh); }}>Taller</button>
          <button className={`tool ${penOnly ? "on" : ""}`} onClick={() => setPenOnly(!penOnly)} title="Ignore fingers and palm, draw only with Apple Pencil">
            Pencil only
          </button>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${h}`}
        className={`drawing-canvas ${editable ? "editable" : ""} ${eraser ? "erasing" : ""}`}
        style={{ aspectRatio: `${W} / ${h}`, touchAction: editable ? "none" : "auto" }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      >
        <Strokes strokes={display} height={h} />
      </svg>
    </div>
  );
}

export const DrawingBlock = createReactBlockSpec(
  {
    type: "drawing",
    propSchema: {
      strokes: { default: "[]" },
      height: { default: 450 },
    },
    content: "none",
  },
  {
    render: ({ block, editor }) => (
      <DrawingCanvas
        strokesJson={block.props.strokes}
        height={block.props.height}
        editable={editor.isEditable}
        onSave={(strokes, height) => editor.updateBlock(block, { props: { strokes, height } })}
      />
    ),
    toExternalHTML: ({ block }) => (
      <svg viewBox={`0 0 ${W} ${block.props.height}`} width="100%">
        <Strokes strokes={parse(block.props.strokes)} height={block.props.height} />
      </svg>
    ),
  },
);
