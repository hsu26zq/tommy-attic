"use client";
import { Component, type ReactNode } from "react";

// If the editor ever crashes, retry it once quietly; only the editor area is affected, never the whole page.
export default class EditorBoundary extends Component<{ children: ReactNode }, { error: Error | null; tries: number }> {
  state = { error: null as Error | null, tries: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[editor]", error);
    if (this.state.tries < 1) setTimeout(() => this.setState((s) => ({ error: null, tries: s.tries + 1 })), 300);
  }

  render() {
    if (this.state.error && this.state.tries >= 1) {
      return (
        <div className="editor-crash">
          <span>The editor hit a problem. Your note is saved.</span>
          <button className="btn small secondary" onClick={() => window.location.reload()}>Reload</button>
        </div>
      );
    }
    if (this.state.error) return null;
    return this.props.children;
  }
}
