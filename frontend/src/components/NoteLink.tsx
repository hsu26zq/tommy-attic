"use client";
import { createReactInlineContentSpec } from "@blocknote/react";

// A link to another note, inserted by typing "@". Backlinks are found by searching for its noteId.
export const NoteLink = createReactInlineContentSpec(
  {
    type: "noteLink",
    propSchema: {
      noteId: { default: "" },
      title: { default: "Untitled" },
    },
    content: "none",
  },
  {
    render: ({ inlineContent, editor }) =>
      editor.isEditable ? (
        <a className="note-link" href={`/edit/${inlineContent.props.noteId}`} contentEditable={false}>
          {inlineContent.props.title}
        </a>
      ) : (
        <span className="note-link">{inlineContent.props.title}</span>
      ),
    toExternalHTML: ({ inlineContent }) => <span>{inlineContent.props.title}</span>,
  },
);
