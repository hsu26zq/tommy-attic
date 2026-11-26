"use client";

export function PanelIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2.25" />
      <path d="M6 3v10" />
    </svg>
  );
}

// A quiet page mark instead of an emoji, for pages without an icon
export function PageGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
      <path d="M3.5 1.75h4.75L11 4.5v7.25a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-9.5a.5.5 0 0 1 .5-.5Z" />
      <path d="M8 2v2.75h2.75" />
    </svg>
  );
}
