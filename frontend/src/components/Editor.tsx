"use client";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { combineByGroup, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { CollaborationExtension } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { getMultiColumnSlashMenuItems } from "@blocknote/xl-multi-column";
import { baseExtensions, editableOptions } from "./editorSetup";
import { isTrustedHere, supabase } from "@/lib/supabase";
import { api, type Database, type NoteSummary } from "@/lib/api";

export type SyncStatus = "connecting" | "synced" | "offline";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorHandle = { replaceContent: (blocks: unknown[]) => void; editor: any };

type Props = {
  noteId: string;
  initialContent: unknown[];
  onChange: (content: unknown[], markdown: string) => void;
  onStatus?: (s: SyncStatus) => void;
  onReady?: (h: EditorHandle) => void;
};

const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:8080";
const COLORS = ["#2f6fde", "#d9730d", "#0f7b6c", "#9065b0", "#c14c8a"];

function deviceLabel() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Mac/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : "Computer";
}

// One shared document per note: your devices edit the same copy live and changes merge.
// Trusted devices also keep an offline copy, so you can keep writing without internet.
function useSyncedDoc(noteId: string) {
  const [setup] = useState(() => {
    const doc = new Y.Doc();
    const local = isTrustedHere() ? new IndexeddbPersistence(`ta-note-${noteId}`, doc) : null;
    const provider = new HocuspocusProvider({
      url: COLLAB_URL,
      name: noteId,
      document: doc,
      token: async () => (await supabase().auth.getSession()).data.session?.access_token ?? "",
    });
    return { doc, provider, local };
  });
  useEffect(
    () => () => {
      setup.provider.destroy();
      setup.local?.destroy();
      setup.doc.destroy();
    },
    [setup],
  );
  return setup;
}

export default function Editor({ noteId, initialContent, onChange, onStatus, onReady }: Props) {
  const { doc, provider, local } = useSyncedDoc(noteId);
  const [ready, setReady] = useState(false);
  const seeded = useRef(false);

  const editor = useCreateBlockNote({
    ...editableOptions,
    extensions: [
      ...baseExtensions,
      CollaborationExtension({
        fragment: doc.getXmlFragment("document-store"),
        user: { name: typeof navigator !== "undefined" ? deviceLabel() : "", color: COLORS[Math.floor(Math.random() * COLORS.length)] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: { awareness: (provider.awareness ?? undefined) as any },
      }),
    ],
  });

  useEffect(() => {
    onReady?.({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      replaceContent: (blocks) => editor.replaceBlocks(editor.document, (blocks.length ? blocks : [{ type: "paragraph" }]) as any),
      editor,
    });
  }, [editor, onReady]);

  useEffect(() => {
    // First open with sync: fill the shared document from the saved copy.
    const seed = () => {
      if (seeded.current) return;
      seeded.current = true;
      if (doc.getXmlFragment("document-store").length === 0 && initialContent.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.replaceBlocks(editor.document, initialContent as any);
      }
      setReady(true);
    };
    const onSynced = ({ state }: { state: boolean }) => {
      if (state) {
        onStatus?.("synced");
        seed();
      }
    };
    const onConn = ({ status }: { status: string }) => {
      if (status === "disconnected") onStatus?.("offline");
      else if (status === "connecting") onStatus?.("connecting");
    };
    provider.on("synced", onSynced);
    provider.on("status", onConn);
    if (provider.isSynced) onSynced({ state: true });
    local?.whenSynced.then(() => {
      if (doc.getXmlFragment("document-store").length > 0) {
        seeded.current = true;
        setReady(true);
      }
    });
    return () => {
      provider.off("synced", onSynced);
      provider.off("status", onConn);
    };
  }, [provider, local, doc, editor, initialContent, onStatus]);

  const extraSlashItems: DefaultReactSuggestionItem[] = [
    {
      title: "Database",
      subtext: "A table where every row is its own page",
      aliases: ["database", "table view", "db", "list"],
      group: "Advanced",
      icon: <span className="slash-icon">▦</span>,
      onItemClick: async () => {
        const db = await api<Database>("/databases", { method: "POST", body: JSON.stringify({ note_id: noteId }) });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        insertOrUpdateBlockForSlashMenu(editor, { type: "database", props: { databaseId: db.id } } as any);
      },
    },
    {
      title: "Drawing",
      subtext: "Draw or handwrite with Apple Pencil, pen or mouse",
      aliases: ["draw", "pencil", "sketch", "handwriting", "ink"],
      group: "Media",
      icon: <span className="slash-icon">✎</span>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "drawing" } as any),
    },
    {
      title: "PDF",
      subtext: "Read a PDF inside the note",
      aliases: ["pdf", "document", "reader"],
      group: "Media",
      icon: <span className="slash-icon">⎙</span>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "pdf" } as any),
    },
  ];

  // "@" links to another note
  async function noteLinkItems(query: string): Promise<DefaultReactSuggestionItem[]> {
    const list = await api<NoteSummary[]>("/notes").catch(() => [] as NoteSummary[]);
    const q = query.toLowerCase();
    return list
      .filter((n) => n.id !== noteId && (n.title || "Untitled").toLowerCase().includes(q))
      .slice(0, 10)
      .map((n) => ({
        title: n.title || "Untitled",
        icon: <span className="slash-icon">{n.icon || "↗"}</span>,
        onItemClick: () =>
          editor.insertInlineContent([
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            { type: "noteLink", props: { noteId: n.id, title: n.title || "Untitled" } } as any,
            " ",
          ]),
      }));
  }

  return (
    <>
      {!ready && <p className="muted small">Connecting… (up to a minute if the server was asleep)</p>}
      <div style={{ display: ready ? "block" : "none" }}>
        <BlockNoteView
          editor={editor}
          editable={ready}
          theme="light"
          slashMenu={false}
          onChange={() => {
            if (ready) onChange(editor.document as unknown[], editor.blocksToMarkdownLossy(editor.document));
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) =>
              filterSuggestionItems(
                combineByGroup(getDefaultReactSlashMenuItems(editor), getMultiColumnSlashMenuItems(editor), extraSlashItems),
                query,
              )
            }
          />
          <SuggestionMenuController triggerCharacter="@" getItems={noteLinkItems} />
        </BlockNoteView>
      </div>
    </>
  );
}
