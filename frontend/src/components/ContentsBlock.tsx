"use client";
import { useState } from "react";
import { createReactBlockSpec, useEditorChange } from "@blocknote/react";

// "/contents": the page's headings as a list; click one to jump there. Updates as you write.
type Heading = { id: string; level: number; text: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function headingsOf(blocks: any[], out: Heading[] = []): Heading[] {
  for (const b of blocks) {
    if (b.type === "heading") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = (b.content ?? []).map((c: any) => c.text ?? c.props?.title ?? "").join("").trim();
      if (text) out.push({ id: b.id, level: Number(b.props?.level ?? 1), text });
    }
    if (b.children?.length) headingsOf(b.children, out);
  }
  return out;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Contents({ editor }: { editor: any }) {
  const [list, setList] = useState<Heading[]>(() => headingsOf(editor.document));
  useEditorChange(() => {
    const next = headingsOf(editor.document);
    setList((cur) => (JSON.stringify(cur) === JSON.stringify(next) ? cur : next));
  }, editor);

  if (!list.length) return <div className="contents empty">Add headings and they'll be listed here.</div>;
  const top = Math.min(...list.map((h) => h.level));
  return (
    <nav className="contents" contentEditable={false}>
      {list.map((h) => (
        <a
          key={h.id}
          href={`#${h.id}`}
          style={{ marginLeft: (h.level - top) * 16 }}
          onClick={(e) => {
            e.preventDefault();
            const el = document.querySelector(`.bn-block-outer[data-id="${CSS.escape(h.id)}"]`);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
            el?.classList.add("flash");
            setTimeout(() => el?.classList.remove("flash"), 1800);
          }}
        >
          {h.text}
        </a>
      ))}
    </nav>
  );
}

export const ContentsBlock = createReactBlockSpec(
  { type: "contents", propSchema: {}, content: "none" },
  {
    render: ({ editor }) => <Contents editor={editor} />,
    toExternalHTML: () => <p>[Contents]</p>,
  },
);
