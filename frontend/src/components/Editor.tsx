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
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from "@blocknote/react";
import { getMultiColumnSlashMenuItems } from "@blocknote/xl-multi-column";
import { editableOptions } from "./editorSetup";
import { isTrustedHere, supabase } from "@/lib/supabase";

type Props = {
  noteId: string;
  initialContent: unknown[];
  onChange: (content: unknown[], markdown: string) => void;
};

export type SyncStatus = "connecting" | "synced" | "offline";

const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:8080";
const COLORS = ["#b5552b", "#2f5fb3", "#3f7a4a", "#8a4fb3", "#c28a1d"];

function deviceLabel() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad|Macintosh.*Mobile/.test(ua) ? "iPad" : /Mac/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : "Computer";
}

// One shared document per note. Your devices edit the same copy live; changes merge automatically.
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

export default function Editor({ noteId, initialContent, onChange }: Props) {
  const { doc, provider, local } = useSyncedDoc(noteId);
  const [status, setStatus] = useState<SyncStatus>("connecting");
  const [ready, setReady] = useState(false);
  const seeded = useRef(false);

  const editor = useCreateBlockNote({
    ...editableOptions,
    extensions: [
      CollaborationExtension({
        fragment: doc.getXmlFragment("document-store"),
        user: { name: `Tommy · ${typeof navigator !== "undefined" ? deviceLabel() : ""}`, color: COLORS[Math.floor(Math.random() * COLORS.length)] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: { awareness: (provider.awareness ?? undefined) as any },
      }),
    ],
  });

  useEffect(() => {
    // The first time a note is opened with sync, fill the shared document from the saved copy.
    const seed = () => {
      if (seeded.current) return;
      seeded.current = true;
      const fragment = doc.getXmlFragment("document-store");
      if (fragment.length === 0 && initialContent.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        editor.replaceBlocks(editor.document, initialContent as any);
      }
      setReady(true);
    };
    const onSynced = ({ state }: { state: boolean }) => {
      if (state) {
        setStatus("synced");
        seed();
      }
    };
    const onStatus = ({ status: s }: { status: string }) => {
      if (s === "disconnected") setStatus("offline");
      else if (s === "connecting") setStatus((cur) => (cur === "synced" ? "offline" : "connecting"));
    };
    provider.on("synced", onSynced);
    provider.on("status", onStatus);
    if (provider.isSynced) onSynced({ state: true });
    // Trusted devices can start right away from their offline copy.
    local?.whenSynced.then(() => {
      if (doc.getXmlFragment("document-store").length > 0) {
        seeded.current = true;
        setReady(true);
      }
    });
    return () => {
      provider.off("synced", onSynced);
      provider.off("status", onStatus);
    };
  }, [provider, local, doc, editor, initialContent]);

  const label = { connecting: "Connecting…", synced: "Live", offline: local ? "Offline (saved on this device)" : "Offline" }[status];

  return (
    <>
      <div className={`sync-pill ${status}`} title="Live sync between your devices">
        <span className="dot" /> {label}
      </div>
      {!ready && (
        <p className="muted small">Connecting to the sync server… (up to a minute if it was asleep)</p>
      )}
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
                combineByGroup(getDefaultReactSlashMenuItems(editor), getMultiColumnSlashMenuItems(editor), [
                  {
                    title: "Drawing",
                    subtext: "Draw or handwrite with Apple Pencil, pen or mouse",
                    aliases: ["draw", "pencil", "sketch", "handwriting", "ink"],
                    group: "Media",
                    icon: <span style={{ fontSize: 18 }}>✍️</span>,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "drawing" } as any),
                  },
                  {
                    title: "PDF",
                    subtext: "Read a PDF right inside the note",
                    aliases: ["pdf", "document", "reader"],
                    group: "Media",
                    icon: <span style={{ fontSize: 18 }}>📄</span>,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "pdf" } as any),
                  },
                ] as ReturnType<typeof getDefaultReactSlashMenuItems>),
                query,
              )
            }
          />
        </BlockNoteView>
      </div>
    </>
  );
}
