"use client";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { BlockNoteView } from "@blocknote/mantine";
import { useCreateBlockNote } from "@blocknote/react";
import { baseExtensions, editorOptions } from "./editorSetup";

// Read-only view of a note (public pages and version previews).
export default function Viewer({ content }: { content: unknown[] }) {
  const editor = useCreateBlockNote({
    ...editorOptions,
    extensions: baseExtensions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: content.length ? (content as any) : undefined,
  });
  return <BlockNoteView editor={editor} editable={false} theme="light" />;
}
