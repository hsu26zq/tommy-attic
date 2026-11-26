"use client";
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { codeBlockOptions, syntaxHighlighter } from "@blocknote/code-block";
import { withMultiColumn, multiColumnDropCursor, locales as columnLocales } from "@blocknote/xl-multi-column";
import { resolveFileUrl, uploadFile } from "@/lib/files";
import { DrawingBlock } from "./DrawingBlock";
import { PdfBlock } from "./PdfBlock";
import { DatabaseBlock } from "./database/DatabaseBlock";
import { NoteLink } from "./NoteLink";

// Shared editor settings for both the editor (you) and the read-only viewer (visitors).
export const schema = withMultiColumn(
  BlockNoteSchema.create({
    // pdf goes last so dropped PDFs become PDF blocks instead of plain file attachments
    blockSpecs: {
      ...defaultBlockSpecs,
      codeBlock: createCodeBlockSpec(codeBlockOptions),
      drawing: DrawingBlock(),
      database: DatabaseBlock(),
      pdf: PdfBlock(),
    },
    inlineContentSpecs: { ...defaultInlineContentSpecs, noteLink: NoteLink },
  }),
);

export const editorOptions = {
  schema,
  dropCursor: multiColumnDropCursor,
  dictionary: { ...en, multi_column: columnLocales.en },
  tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
  resolveFileUrl,
};

export const editableOptions = { ...editorOptions, uploadFile };

// Code highlighting (added as an editor extension)
export const baseExtensions = [syntaxHighlighter];
