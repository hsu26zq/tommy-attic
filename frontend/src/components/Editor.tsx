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
import { useDark } from "@/lib/useDark";
import {
  BlockColorsItem,
  DragHandleMenu,
  RemoveBlockItem,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  getDefaultReactSlashMenuItems,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useExtensionState,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { SideMenuExtension } from "@blocknote/core/extensions";
import { copyText, toast } from "@/lib/exportNote";
import { getMultiColumnSlashMenuItems } from "@blocknote/xl-multi-column";
import { baseExtensions, editableOptions, editorOptions } from "./editorSetup";
import { isTrustedHere, supabase } from "@/lib/supabase";
import { api, type Database, type NoteSummary } from "@/lib/api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorHandle = { replaceContent: (blocks: unknown[]) => void; editor: any };

type Props = {
  noteId: string;
  initialContent: unknown[];
  initialYdoc: string | null;
  onChange: (content: unknown[], markdown: string, ydoc: string) => void;
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

// "Copy link" in the ⋮⋮ menu: a link that opens this page scrolled to the block
function CopyBlockLinkItem() {
  const C = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const block = useExtensionState(SideMenuExtension as any, { editor, selector: (s: any) => s?.block }) as { id: string } | undefined;
  if (!block) return null;
  return (
    <C.Generic.Menu.Item
      className="bn-menu-item"
      onClick={async () => {
        const ok = await copyText(`${location.origin}${location.pathname}#${block.id}`);
        toast(ok ? "Link copied" : "Couldn't copy");
      }}
    >
      Copy link
    </C.Generic.Menu.Item>
  );
}

export default function Editor(props: Props) {
  const { doc, provider } = useSyncedDoc(props.noteId, props.initialYdoc, props.initialContent);
  if (!provider) return null;
  return <LiveEditor {...props} doc={doc} provider={provider} />;
}

function LiveEditor({ noteId, onChange, onReady, doc, provider }: Props & { doc: Y.Doc; provider: HocuspocusProvider }) {

  const dark = useDark();
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

  // Opened from a block link (#block-id): scroll to that block and mark it briefly
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (!id) return;
    const t = setTimeout(() => {
      const el = document.querySelector(`.bn-block-outer[data-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.add("flash");
      setTimeout(() => el.classList.remove("flash"), 1800);
    }, 400);
    return () => clearTimeout(t);
  }, []);

  // Let clicks on a code block's language picker reach the picker instead of the editor
  useEffect(() => {
    const keep = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('[data-content-type="codeBlock"] select')) e.stopPropagation();
    };
    window.addEventListener("mousedown", keep, true);
    window.addEventListener("pointerdown", keep, true);
    return () => {
      window.removeEventListener("mousedown", keep, true);
      window.removeEventListener("pointerdown", keep, true);
    };
  }, []);

  const extraSlashItems: DefaultReactSuggestionItem[] = [
    {
      title: "Callout",
      subtext: "A tinted note with an emoji",
      aliases: ["callout", "note", "tip", "warning", "info", "box"],
      group: "Basic blocks",
      icon: <span className="slash-icon">💡</span>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "callout" } as any),
    },
    {
      title: "Embed",
      subtext: "YouTube, Vimeo, Loom, or a link preview",
      aliases: ["embed", "youtube", "video", "link", "bookmark", "url", "vimeo", "loom"],
      group: "Media",
      icon: <span className="slash-icon">⧉</span>,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "embed" } as any),
    },
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
          theme={dark ? "dark" : "light"}
          slashMenu={false}
          sideMenu={false}
          onChange={() => {
            onChange(editor.document as unknown[], editor.blocksToMarkdownLossy(editor.document), toBase64(Y.encodeStateAsUpdate(doc)));
          }}
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => {
              const found = filterSuggestionItems(
                combineByGroup(getDefaultReactSlashMenuItems(editor), getMultiColumnSlashMenuItems(editor), extraSlashItems),
                query,
              );
              // Within each group, names that start with what you typed come first ("/emb" → Embed before File)
              const q = query.toLowerCase();
              const groups = [...new Set(found.map((i) => i.group))];
              const rank = (i: DefaultReactSuggestionItem) => (q && i.title.toLowerCase().startsWith(q) ? 0 : 1);
              return found
                .map((item, n) => ({ item, n }))
                .sort((x, y) => groups.indexOf(x.item.group) - groups.indexOf(y.item.group) || rank(x.item) - rank(y.item) || x.n - y.n)
                .map((x) => x.item);
            }}
          />
          <SuggestionMenuController triggerCharacter="@" getItems={noteLinkItems} />
          <SideMenuController
            sideMenu={(props) => (
              <SideMenu
                {...props}
                dragHandleMenu={(p) => (
                  <DragHandleMenu {...p}>
                    <RemoveBlockItem>Delete</RemoveBlockItem>
                    <BlockColorsItem>Colors</BlockColorsItem>
                    <CopyBlockLinkItem />
                    <TableRowHeaderItem>Header row</TableRowHeaderItem>
                    <TableColumnHeaderItem>Header column</TableColumnHeaderItem>
                  </DragHandleMenu>
                )}
              />
            )}
          />
        </BlockNoteView>
      </div>
    </>
  );
}
