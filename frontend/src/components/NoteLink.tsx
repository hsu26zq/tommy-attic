"use client";
import Link from "next/link";
import { createReactInlineContentSpec } from "@blocknote/react";
import { useWorkspace } from "./workspace/Workspace";
import { prefetchNote } from "@/lib/noteCache";

// Shows the linked page's current name and icon (the saved title is only a fallback).
function LinkLabel({ noteId, title }: { noteId: string; title: string }) {
  const { notes } = useWorkspace();
  const live = notes?.find((n) => n.id === noteId);
  return (
    <>
      {live?.icon ? `${live.icon} ` : ""}
      {live?.title || title || "Untitled"}
    </>
  );
}

// A link to another note: made with "@", or by "/page" (a new page inside this one).
// Backlinks are found by searching for its noteId.
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
        <Link className="note-link" href={`/edit/${inlineContent.props.noteId}`} contentEditable={false} onMouseEnter={() => prefetchNote(inlineContent.props.noteId)}>
          <LinkLabel noteId={inlineContent.props.noteId} title={inlineContent.props.title} />
        </Link>
      ) : (
        <span className="note-link">{inlineContent.props.title}</span>
      ),
    toExternalHTML: ({ inlineContent }) => <span>{inlineContent.props.title}</span>,
  },
);
