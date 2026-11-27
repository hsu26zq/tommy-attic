"use client";
import { createReactBlockSpec } from "@blocknote/react";

// Quotes are gone: any old quote shows as plain text, and typing ">" no longer makes one.
// (Kept under the same name so pages that still contain a quote open normally.)
export const PlainQuote = createReactBlockSpec(
  { type: "quote", propSchema: {}, content: "inline" },
  {
    render: ({ contentRef }) => <p className="plain-quote" ref={contentRef} />,
    toExternalHTML: ({ contentRef }) => <p ref={contentRef} />,
  },
);
