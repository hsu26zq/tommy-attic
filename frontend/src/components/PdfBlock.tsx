"use client";
import { useEffect, useRef, useState } from "react";
import { createReactBlockSpec, FileBlockWrapper } from "@blocknote/react";
import { resolveFileUrl } from "@/lib/files";

// PDF block: reads the PDF right inside the note, using PDF.js (Mozilla's free PDF reader).
// Works the same on computers, iPhone and iPad. Drag a PDF into a note to create one.

type PdfDoc = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (o: { scale: number }) => { width: number; height: number };
    render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas: HTMLCanvasElement }) => { promise: Promise<void> };
  }>;
  destroy: () => void;
};

async function loadPdf(url: string): Promise<PdfDoc> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  return (await pdfjs.getDocument({ url }).promise) as unknown as PdfDoc;
}

function PdfPage({ pdf, n, width, zoom }: { pdf: PdfDoc; n: number; width: number; zoom: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const holder = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(n <= 2);
  const [ratio, setRatio] = useState(1.414);

  // Only draw pages when they scroll near the screen (fast for big PDFs)
  useEffect(() => {
    const el = holder.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setVisible(true), { rootMargin: "600px" });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || !width) return;
    let cancelled = false;
    pdf.getPage(n).then(async (page) => {
      const base = page.getViewport({ scale: 1 });
      setRatio(base.height / base.width);
      const cssWidth = width * zoom;
      const scale = (cssWidth / base.width) * Math.min(window.devicePixelRatio || 1, 2);
      const viewport = page.getViewport({ scale });
      const canvas = ref.current;
      if (!canvas || cancelled) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d")!, viewport, canvas }).promise.catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [pdf, n, width, zoom, visible]);

  return (
    <div ref={holder} className="pdf-page" style={{ width: width * zoom, height: width * zoom * ratio }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}

function PdfViewer({ url, height, collapsed, onToggle }: { url: string; height: number; collapsed: boolean; onToggle?: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  const [pdf, setPdf] = useState<PdfDoc | null>(null);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    resolveFileUrl(url).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (!src || collapsed) return;
    let doc: PdfDoc | null = null;
    loadPdf(src)
      .then((d) => {
        doc = d;
        setPdf(d);
      })
      .catch(() => setError("Couldn't open this PDF."));
    return () => doc?.destroy();
  }, [src, collapsed]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 24));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={`pdf-viewer ${collapsed ? "pdf-collapsed" : ""}`} contentEditable={false} onMouseDown={(e) => e.stopPropagation()}>
      <div className="pdf-tools">
        <span className="muted small">{collapsed ? "PDF" : pdf ? `${pdf.numPages} page${pdf.numPages === 1 ? "" : "s"}` : error || "Loading PDF…"}</span>
        <span style={{ flex: 1 }} />
        {!collapsed && (
          <>
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>−</button>
            <span className="small">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>+</button>
          </>
        )}
        {onToggle && (
          <button className="pdf-toggle" onClick={onToggle}>{collapsed ? "Show" : "Hide"}</button>
        )}
        {src && (
          <a href={src} target="_blank" rel="noreferrer" className="small">
            Open ↗
          </a>
        )}
      </div>
      <div ref={box} className="pdf-pages" style={{ height, display: collapsed ? "none" : undefined }}>
        {pdf && width > 0 && Array.from({ length: pdf.numPages }, (_, i) => <PdfPage key={i} pdf={pdf} n={i + 1} width={width} zoom={zoom} />)}
      </div>
    </div>
  );
}

export const PdfBlock = createReactBlockSpec(
  {
    type: "pdf",
    propSchema: {
      backgroundColor: { default: "default" },
      name: { default: "" },
      url: { default: "" },
      caption: { default: "" },
      height: { default: 720 },
      collapsed: { default: false },
    },
    content: "none",
  },
  {
    meta: { fileBlockAccept: ["application/pdf", ".pdf"] },
    render: (props) => (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <FileBlockWrapper {...(props as any)} buttonIcon={<span>📄</span>}>
        {props.block.props.url ? (
          <PdfViewer
            url={props.block.props.url}
            height={props.block.props.height}
            collapsed={props.block.props.collapsed}
            onToggle={props.editor.isEditable ? () => props.editor.updateBlock(props.block, { props: { collapsed: !props.block.props.collapsed } }) : undefined}
          />
        ) : null}
      </FileBlockWrapper>
    ),
    toExternalHTML: ({ block }) =>
      block.props.url ? <a href={block.props.url}>{block.props.name || "PDF"}</a> : <span />,
  },
);
