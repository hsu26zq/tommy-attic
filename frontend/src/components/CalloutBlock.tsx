"use client";
import { useState } from "react";
import { createReactBlockSpec } from "@blocknote/react";

// A soft, tinted note with an emoji. Click the emoji to change it; the dot changes the tint.
const TINTS = ["sand", "clay", "sage", "dusk", "plum", "gray"] as const;
const EMOJIS = ["💡", "📌", "⚠️", "✅", "❗", "🧠", "📎", "🔥", "💬", "⭐"];

export const CalloutBlock = createReactBlockSpec(
  {
    type: "callout",
    propSchema: {
      emoji: { default: "💡" },
      tint: { default: "sand" },
    },
    content: "inline",
  },
  {
    render: ({ block, editor, contentRef }) => {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      const [open, setOpen] = useState(false);
      const set = (props: Record<string, string>) => editor.updateBlock(block, { props });
      return (
        <div className={`callout tint-${block.props.tint}`}>
          <div className="callout-side" contentEditable={false}>
            <button className="callout-emoji" onClick={() => editor.isEditable && setOpen(!open)}>{block.props.emoji}</button>
            {open && (
              <div className="callout-menu" onMouseLeave={() => setOpen(false)}>
                <div className="callout-emojis">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { set({ emoji: e }); setOpen(false); }}>{e}</button>
                  ))}
                </div>
                <div className="callout-tints">
                  {TINTS.map((t) => (
                    <button key={t} className={`tint-dot tint-${t} ${block.props.tint === t ? "on" : ""}`} onClick={() => { set({ tint: t }); setOpen(false); }} aria-label={t} />
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="callout-text" ref={contentRef} />
        </div>
      );
    },
    // Markdown / copy: a quote with the emoji in front
    toExternalHTML: ({ block, contentRef }) => (
      <blockquote>
        <p>
          {block.props.emoji} <span ref={contentRef} />
        </p>
      </blockquote>
    ),
  },
);
