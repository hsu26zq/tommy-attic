"use client";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { useEffect, useState } from "react";
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { BlockNoteEditor, combineByGroup, filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
import { CollaborationExtension, blocksToYXmlFragment } from "@blocknote/core/yjs";
import { BlockNoteView } from "@blocknote/mantine";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { getMultiColumnSlashMenuItems } from "@blocknote/xl-multi-column";
import { baseExtensions, editableOptions, editorOptions } from "./editorSetup";
import { isTrustedHere, supabase } from "@/lib/supabase";
import { api, type Database, type NoteSummary } from "@/lib/api";

export type SyncStatus = "connecting" | "synced" | "offline";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorHandle = { replaceContent: (blocks: unknown[]) => void; editor: any };

type Props = {
  noteId: string;
  initialContent: unknown[];
  initialYdoc: string | null;
  onChange: (content: unknown[], markdown: string, ydoc: string) => void;
  onStatus?: (s: SyncStatus) => void;
  onReady?: (h: EditorHandle) => void;
};

const COLLAB_URL = process.env.NEXT_PUBLIC_COLLAB_URL ?? "ws://localhost:8080";
const COLORS = ["#2f6fde", "#d9730d", "#0f7b6c", "#9065b0", "#c14c8a"];

function deviceLabel() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Mac/.test(ua) ? "Mac" : /Android/.test(ua) ? "Android" : "Computer";
}

const toBase64 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

// One shared document per note: your devices edit the same copy live and changes merge.
// The note opens from the saved copy (and this device's offline copy) before the editor appears,
// so nothing has to change under your cursor; the live connection joins in the background.
let converter: BlockNoteEditor | null = null;
function seed(doc: Y.Doc, blocks: unknown[]) {
  const fragment = doc.getXmlFragment("document-store");
  if (fragment.length > 0 || !blocks.length) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    converter ??= BlockNoteEditor.create({ schema: editorOptions.schema }) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blocksToYXmlFragment(converter as any, blocks as any, fragment);
  } catch (e) {
    console.error("[editor] couldn't load saved blocks", e);
  }
}

function useSyncedDoc(noteId: string, initialYdoc: string | null, initialContent: unknown[]) {
  const [loaded, setLoaded] = useState(false);
  const [setup] = useState(() => {
    const doc = new Y.Doc();
    if (initialYdoc) {
      try {
        Y.applyUpdate(doc, fromBase64(initialYdoc));
      } catch {}
    }
    const local = isTrustedHere() ? new IndexeddbPersistence(`ta-note-${noteId}`, doc) : null;
    return { doc, local, provider: null as HocuspocusProvider | null };
  });

  useEffect(() => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      seed(setup.doc, initialContent);
      setup.provider = new HocuspocusProvider({
        url: COLLAB_URL,
        name: noteId,
        document: setup.doc,
        token: async () => (await supabase().auth.getSession()).data.session?.access_token ?? "",
      });
      setLoaded(true);
    };
    if (setup.local) {
      setup.local.whenSynced.then(finish);
      setTimeout(finish, 1500); // never wait long for the offline copy
    } else finish();
    return () => {
      // Disconnect only; the editor may still be reading the document while it unmounts.
      setup.provider?.destroy();
      setup.local?.destroy();
    };
  }, [setup, noteId, initialContent]);

  return { doc: setup.doc, provider: loaded ? setup.provider : null };
}

export default function Editor(props: Props) {
  const { doc, provider } = useSyncedDoc(props.noteId, props.initialYdoc, props.initialContent);
  if (!provider) return null;
  return <LiveEditor {...props} doc={doc} provider={provider} />;
}

function LiveEditor({ noteId, onChange, onStatus, onReady, doc, provider }: Props & { doc: Y.Doc; provider: HocuspocusProvider }) {

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

  // Live connection status (edits are saved either way)
  useEffect(() => {
    const onSynced = ({ state }: { state: boolean }) => state && onStatus?.("synced");
    const onConn = ({ status }: { status: string }) => {
      if (status === "disconnected") onStatus?.("offline");
      else if (status === "connecting") onStatus?.("connecting");
    };
    provider.on("synced", onSynced);
    provider.on("status", onConn);
    if (provider.isSynced) onStatus?.("synced");
    return () => {
      provider.off("synced", onSynced);
      provider.off("status", onConn);
    };
  }, [provider, onStatus]);

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
      <div>
        <BlockNoteView
          editor={editor}
          theme="light"
          slashMenu={false}
          onChange={() => {
            onChange(editor.document as unknown[], editor.blocksToMarkdownLossy(editor.document), toBase64(Y.encodeStateAsUpdate(doc)));
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
