"use client";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import { combineByGroup, filterSuggestionItems } from "@blocknote/core";
import { BlockNoteView } from "@blocknote/mantine";
import { SuggestionMenuController, getDefaultReactSlashMenuItems, useCreateBlockNote } from "@blocknote/react";
import { getMultiColumnSlashMenuItems } from "@blocknote/xl-multi-column";
import { editableOptions } from "./editorSetup";

type Props = {
  initialContent: unknown[];
  onChange: (content: unknown[], markdown: string) => void;
};

// The Notion-style editor (BlockNote). Type "/" for blocks, drag files in, drag blocks around.
export default function Editor({ initialContent, onChange }: Props) {
  const editor = useCreateBlockNote({
    ...editableOptions,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    initialContent: initialContent.length ? (initialContent as any) : undefined,
  });

  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      slashMenu={false}
      onChange={() => onChange(editor.document as unknown[], editor.blocksToMarkdownLossy(editor.document))}
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            combineByGroup(getDefaultReactSlashMenuItems(editor), getMultiColumnSlashMenuItems(editor)),
            query,
          )
        }
      />
    </BlockNoteView>
  );
}
