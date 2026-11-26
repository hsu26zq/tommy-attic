"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import NoteEditor from "@/components/NoteEditor";
import { Topbar } from "@/components/workspace/Workspace";
import HistoryPanel from "@/components/workspace/HistoryPanel";

type LinkedNote = { id: string; title: string; icon: string | null };

function Backlinks({ id }: { id: string }) {
  const [links, setLinks] = useState<LinkedNote[]>([]);
  useEffect(() => {
    api<LinkedNote[]>(`/notes/${id}/backlinks`).then(setLinks).catch(() => {});
  }, [id]);
  if (!links.length) return null;
  return (
    <div className="backlinks">
      <div className="backlinks-title">Linked from</div>
      {links.map((l) => (
        <Link key={l.id} href={`/edit/${l.id}`} className="backlink">
          {l.icon || "📄"} {l.title || "Untitled"}
        </Link>
      ))}
    </div>
  );
}

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const showHistory = useSearchParams().get("history") === "1";
  const closeHistory = () => router.replace(`/edit/${id}`);

  return (
    <NoteEditor
      key={id}
      id={id}
      header={(ctx) => (
        <>
          <Topbar
            crumbs={
              <>
                {ctx.note.path.map((p) => (
                  <span key={p.id} className="crumb">
                    <Link href={`/edit/${p.id}`}>{p.icon ? `${p.icon} ` : ""}{p.title || "Untitled"}</Link>
                    <span className="crumb-sep">/</span>
                  </span>
                ))}
                <span className="crumb current">{ctx.note.icon ? `${ctx.note.icon} ` : ""}{ctx.note.title || "Untitled"}</span>
              </>
            }
          />
          {showHistory && (
            <HistoryPanel
              noteId={id}
              onClose={closeHistory}
              onRestore={(v) => {
                ctx.handle.current?.replaceContent(v.content);
                ctx.change({ title: v.title });
                closeHistory();
              }}
            />
          )}
        </>
      )}
      after={() => <Backlinks id={id} />}
    />
  );
}
