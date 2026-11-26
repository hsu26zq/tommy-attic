"use client";
import { useEffect, useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";
import { api } from "@/lib/api";

// Paste a link: videos play right in the note, everything else becomes a small preview card.
type Meta = { title: string; description: string; image: string; site: string };

function videoUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtube.com" && u.searchParams.get("v")) return `https://www.youtube-nocookie.com/embed/${u.searchParams.get("v")}`;
    if (host === "youtube.com" && u.pathname.startsWith("/shorts/")) return `https://www.youtube-nocookie.com/embed/${u.pathname.split("/")[2]}`;
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (host === "vimeo.com" && /^\/\d+/.test(u.pathname)) return `https://player.vimeo.com/video/${u.pathname.split("/")[1]}`;
    if (host === "loom.com" && u.pathname.startsWith("/share/")) return `https://www.loom.com/embed/${u.pathname.split("/")[2]}`;
  } catch {}
  return null;
}

function LinkCard({ url }: { url: string }) {
  const [meta, setMeta] = useState<Meta | null>(null);
  useEffect(() => {
    let alive = true;
    api<Meta>(`/meta?url=${encodeURIComponent(url)}`)
      .then((m) => alive && setMeta(m))
      .catch(() => alive && setMeta({ title: url, description: "", image: "", site: "" }));
    return () => {
      alive = false;
    };
  }, [url]);
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {}
  return (
    <a className="link-card" href={url} target="_blank" rel="noreferrer">
      <span className="link-card-text">
        <span className="link-card-title">{meta?.title ?? host}</span>
        {meta?.description && <span className="link-card-desc">{meta.description}</span>}
        <span className="link-card-site">
          <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=32`} alt="" width={14} height={14} />
          {host}
        </span>
      </span>
      {meta?.image && <img className="link-card-img" src={meta.image} alt="" />}
    </a>
  );
}

export const EmbedBlock = createReactBlockSpec(
  {
    type: "embed",
    propSchema: { url: { default: "" } },
    content: "none",
  },
  {
    render: ({ block, editor }) => {
      const url = block.props.url;
      if (!url) {
        if (!editor.isEditable) return null;
        return (
          <div className="embed-empty" contentEditable={false}>
            <input
              placeholder="Paste a link — YouTube, Vimeo, Loom, or any website — and press Enter"
              onKeyDown={(e) => {
                const v = e.currentTarget.value.trim();
                if (e.key === "Enter" && v) {
                  e.preventDefault();
                  editor.updateBlock(block, { props: { url: /^https?:\/\//.test(v) ? v : `https://${v}` } });
                }
              }}
              onMouseDown={(e) => e.stopPropagation()}
            />
          </div>
        );
      }
      const video = videoUrl(url);
      return (
        <div className="embed" contentEditable={false}>
          {video ? (
            <div className="embed-video">
              <iframe src={video} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen title="Video" />
            </div>
          ) : (
            <LinkCard url={url} />
          )}
        </div>
      );
    },
    toExternalHTML: ({ block }) => (
      <p>
        <a href={block.props.url}>{block.props.url}</a>
      </p>
    ),
  },
);
