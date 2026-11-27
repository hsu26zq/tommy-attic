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
  FormattingToolbar,
  FormattingToolbarController,
  blockTypeSelectItems,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  TableHandlesController,
  getDefaultReactSlashMenuItems,
  useBlockNoteEditor,
  useComponentsContext,
  useCreateBlockNote,
  useExtension,
  useExtensionState,
  type DefaultReactSuggestionItem,
} from "@blocknote/react";
import { SideMenuExtension, SuggestionMenu } from "@blocknote/core/extensions";
import { getMultiColumnSlashMenuItems } from "@blocknote/xl-multi-column";
import { baseExtensions, editableOptions, editorOptions } from "./editorSetup";
import { isTrustedHere, supabase } from "@/lib/supabase";
import { api, type Database, type NoteSummary } from "@/lib/api";
import { notesChanged } from "@/lib/notesEvents";
import BlockSelect from "./BlockSelect";
import ColumnAdder from "./ColumnAdder";
import ColumnMover from "./ColumnMover";
import TableExtend, { TableDragPreview } from "./TableExtend";
import { dateGuesses } from "./DateMention";
import { useWorkspace } from "./workspace/Workspace";
import { useRouter } from "next/navigation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EditorHandle = { replaceContent: (blocks: unknown[]) => void; editor: any }; // eslint-disable-line @typescript-eslint/no-explicit-any

type Props = {
  noteId: string;
  initialContent: unknown[];
  initialYdoc: string | null;
  // Called on every edit with a way to read the page; the (slow) reading happens only when saving
  onChange: (snapshot: () => { content: unknown[]; markdown: string; ydoc: string }) => void;
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
  if (fragment.length > 0 || !blocks?.length) return;
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

// One handle per block: a plus made of dots. Click it to add a line below (opens the / menu); press and drag it to move the block.
// small line icons for the / menu (drawn, not emoji, so they take a colour)
function Ico({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const ICON_COLORS: Record<string, string> = {
  Emoji: "#f5c451",
  Text: "#e8e4dc",
  Heading: "#f08a5d",
  "Code Block": "#7cc4ff",
  Divider: "#a9a59d",
  Columns: "#b892ff",
  Page: "#8fd18b",
  Contents: "#5fd3c6",
  Table: "#ffb86b",
  Database: "#ff7eb6",
  Drawing: "#f05a5a",
  Date: "#7aa2ff",
  Today: "#7aa2ff",
  Tomorrow: "#7aa2ff",
};

function DotPlusIcon() {
  const dots = [[12, 5], [5, 12], [12, 12], [19, 12], [12, 19]];
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      {dots.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="2.1" fill="currentColor" />)}
    </svg>
  );
}

function DotPlusHandle() {
  const C = useComponentsContext()!;
  const editor = useBlockNoteEditor();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const side = useExtension(SideMenuExtension as any) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const suggest = useExtension(SuggestionMenu as any) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const block = useExtensionState(SideMenuExtension as any, { editor, selector: (s: any) => s?.block }) as any;
  if (!block) return null;
  const add = () => {
    const empty = Array.isArray(block.content) && block.content.length === 0;
    const target = empty ? block : editor.insertBlocks([{ type: "paragraph" }], block, "after")[0];
    editor.setTextCursorPosition(target);
    suggest.openSuggestionMenu("/");
  };
  return (
    <C.SideMenu.Button
      className="bn-button dot-plus"
      label="Click to add · drag to move"
      draggable
      onDragStart={(e: React.DragEvent) => side.blockDragStart(e, block)}
      onDragEnd={side.blockDragEnd}
      icon={
        <span className="dot-plus-hit" onClick={add} data-test="dotPlus">
          <DotPlusIcon />
        </span>
      }
    />
  );
}

export default function Editor(props: Props) {
  const { doc, provider } = useSyncedDoc(props.noteId, props.initialYdoc, props.initialContent);
  if (!provider) return null;
  return <LiveEditor {...props} doc={doc} provider={provider} />;
}

function LiveEditor({ noteId, onChange, onReady, doc, provider }: Props & { doc: Y.Doc; provider: HocuspocusProvider }) {
  const router = useRouter();
  const { notes: workspaceNotes } = useWorkspace();

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

  // The / menu: Emoji first, one Heading, "Text" instead of Paragraph, one Columns item.
  // Lists, quotes, media, callouts and embeds aren't in it: type "1." / "-" / "[]" for lists,
  // drag files straight in, and paste a link on an empty line for an embed.
  const HIDDEN = new Set(["heading_2", "heading_3", "toggle_heading", "toggle_heading_2", "toggle_heading_3", "quote", "numbered_list", "bullet_list", "check_list", "toggle_list", "image", "video", "audio", "file"]);
  function slashItems(): DefaultReactSuggestionItem[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const base = (getDefaultReactSlashMenuItems(editor) as any[])
      .filter((i) => !HIDDEN.has(i.key) && !/^(heading_|toggle_heading)/.test(i.key))
      .map((i) => (i.key === "heading" ? { ...i, title: "Heading", badge: undefined } : i.key === "paragraph" ? { ...i, title: "Text", aliases: [...(i.aliases ?? []), "paragraph", "plain"], badge: undefined } : i));
    // Emoji, Text, Heading lead the menu
    const lead = ["emoji", "paragraph", "heading"].flatMap((k) => base.filter((i) => i.key === k).map((i) => ({ ...i, group: "Basic blocks" })));
    const rest = base.filter((i) => !["emoji", "paragraph", "heading"].includes(i.key));
    const [twoCols] = getMultiColumnSlashMenuItems(editor);
    const columns = twoCols ? [{ ...twoCols, title: "Columns", aliases: ["columns", "column", "side by side", "split"] }] : [];
    // every icon gets its own colour
    return combineByGroup([...lead, ...rest] as DefaultReactSuggestionItem[], columns as DefaultReactSuggestionItem[], extraSlashItems).map((i) => ({
      ...i,
      icon: <span className="slash-ico" style={{ color: ICON_COLORS[i.title] ?? "#cfcac2" }}>{i.icon}</span>,
    }));
  }

  const extraSlashItems: DefaultReactSuggestionItem[] = [
    {
      title: "Page",
      subtext: "A new page inside this one",
      aliases: ["page", "subpage", "new page", "child"],
      group: "Basic blocks",
      icon: <Ico d="M7 3h7l4 4v14H7zM14 3v4h4" />,
      onItemClick: async () => {
        const page = await api<NoteSummary>("/notes", { method: "POST", body: JSON.stringify({ parent_id: noteId }) });
        editor.insertInlineContent([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { type: "noteLink", props: { noteId: page.id, title: "Untitled" } } as any,
          " ",
        ]);
        notesChanged();
        // open it (this page saves itself on the way out)
        setTimeout(() => router.push(`/edit/${page.id}`), 300);
      },
    },
    {
      title: "Contents",
      subtext: "A list of this page's headings",
      aliases: ["contents", "toc", "table of contents", "outline"],
      group: "Basic blocks",
      icon: <Ico d="M5 7h14M5 12h14M5 17h9" />,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "contents" } as any),
    },
    {
      title: "Database",
      subtext: "A table where every row is its own page",
      aliases: ["database", "table view", "db", "list"],
      group: "Advanced",
      icon: <Ico d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14" />,
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
      icon: <Ico d="M4 20l4-1 11-11-3-3L5 16zM14 6l3 3" />,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: "drawing" } as any),
    },
  ];

  // "@" links to another note
  // "@": dates first when the words look like one (@today, @fri, @dec 3), then pages to link
  async function noteLinkItems(query: string): Promise<DefaultReactSuggestionItem[]> {
    const dates: DefaultReactSuggestionItem[] = dateGuesses(query).map((d) => ({
      title: d.label,
      subtext: d.iso,
      group: "Date",
      icon: <Ico d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />,
      onItemClick: () =>
        editor.insertInlineContent([
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { type: "date", props: { date: d.iso } } as any,
          " ",
        ]),
    }));
    const list = workspaceNotes ?? (await api<NoteSummary[]>("/notes").catch(() => [] as NoteSummary[]));
    const q = query.toLowerCase();
    const pages: DefaultReactSuggestionItem[] = list
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
        group: "Pages",
      }));
    return [...dates, ...pages];
  }

  return (
    <>
      <div>
        <BlockNoteView
          editor={editor}
          theme="light"
          slashMenu={false}
          sideMenu={false}
          formattingToolbar={false}
          tableHandles={false}
          onChange={() =>
            onChange(() => ({
              content: editor.document as unknown[],
              markdown: editor.blocksToMarkdownLossy(editor.document),
              ydoc: toBase64(Y.encodeStateAsUpdate(doc)),
            }))
          }
        >
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (query) => {
              const found = filterSuggestionItems(slashItems(), query);
              // Within each group, names that start with what you typed come first ("/ta" → Table before Database)
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
          <FormattingToolbarController
            formattingToolbar={() => (
              <FormattingToolbar
                blockTypeSelectItems={blockTypeSelectItems(editor)
                  .filter((i) => i.type !== "quote")
                  .map((i) => (i.type === "paragraph" ? { ...i, name: "Text" } : i))}
              />
            )}
          />
          <BlockSelect editor={editor} />
          <ColumnAdder editor={editor} />
          <ColumnMover editor={editor} />
          <TableHandlesController extendButton={TableExtend} />
          <TableDragPreview />
          <SideMenuController
            sideMenu={(props) => (
              <SideMenu {...props}>
                <DotPlusHandle />
              </SideMenu>
            )}
          />
        </BlockNoteView>
      </div>
    </>
  );
}
