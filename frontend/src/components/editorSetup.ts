"use client";
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import { codeBlockOptions, syntaxHighlighter } from "@blocknote/code-block";
import { withMultiColumn, multiColumnDropCursor, locales as columnLocales } from "@blocknote/xl-multi-column";
import { resolveFileUrl, uploadFile } from "@/lib/files";
import { DrawingBlock } from "./DrawingBlock";
import { CalloutBlock } from "./CalloutBlock";
import { EmbedBlock } from "./EmbedBlock";
import { ContentsBlock } from "./ContentsBlock";
import { DateMention } from "./DateMention";
import { PlainQuote } from "./PlainQuote";
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
      quote: PlainQuote(),
      callout: CalloutBlock(),
      embed: EmbedBlock(),
      contents: ContentsBlock(),
      drawing: DrawingBlock(),
      database: DatabaseBlock(),
      pdf: PdfBlock(),
    },
    inlineContentSpecs: { ...defaultInlineContentSpecs, noteLink: NoteLink, date: DateMention },
  }),
);

export const editorOptions = {
  schema,
  dropCursor: multiColumnDropCursor,
  dictionary: {
    ...en,
    multi_column: columnLocales.en,
    formatting_toolbar: { ...en.formatting_toolbar, table_cell_merge: { tooltip: "Merge cells (Ctrl+M)" } },
    table_handle: { ...en.table_handle, merge_cells_menuitem: "Merge cells (Ctrl+M)", split_cell_menuitem: "Split cell (Ctrl+Shift+M)" },
  },
  tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
  resolveFileUrl,
};

// hoverMargin: the + ⋮⋮ handles show up when the mouse is anywhere on a block's line,
// even far to the left or right of the text
// Pasting a YouTube / Vimeo / Loom link on an empty line turns it into a playable video.
const VIDEO = /^https?:\/\/(www\.|m\.)?(youtube\.com\/(watch\?|shorts\/)|youtu\.be\/|vimeo\.com\/\d|loom\.com\/share\/)\S*$/i;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function pasteHandler({ event, editor, defaultPasteHandler }: any) {
  const text = event.clipboardData?.getData("text/plain")?.trim() ?? "";
  if (VIDEO.test(text)) {
    const block = editor.getTextCursorPosition().block;
    const empty = block.type === "paragraph" && (!block.content || block.content.length === 0);
    if (empty) {
      editor.updateBlock(block, { type: "embed", props: { url: text } });
      return true;
    }
  }
  return defaultPasteHandler();
}

export const editableOptions = { ...editorOptions, uploadFile, pasteHandler, sideMenu: { hoverMargin: 2000 } };

// Code highlighting (added as an editor extension)
export const baseExtensions = [syntaxHighlighter];
