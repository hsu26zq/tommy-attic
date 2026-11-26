"use client";
import { BlockNoteSchema } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { withMultiColumn, multiColumnDropCursor, locales as columnLocales } from "@blocknote/xl-multi-column";
import { resolveFileUrl, uploadFile } from "@/lib/files";

// Shared editor settings for both the editor (you) and the read-only viewer (visitors).
export const schema = withMultiColumn(BlockNoteSchema.create());

export const editorOptions = {
  schema,
  dropCursor: multiColumnDropCursor,
  dictionary: { ...en, multi_column: columnLocales.en },
  tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
  resolveFileUrl,
};

export const editableOptions = { ...editorOptions, uploadFile };
