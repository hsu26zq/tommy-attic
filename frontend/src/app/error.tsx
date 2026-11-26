"use client";
import { useEffect } from "react";

// Anything unexpected: try again once automatically, then offer a reload.
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    const key = "ta_auto_retry";
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      reset();
      setTimeout(() => sessionStorage.removeItem(key), 10000);
    }
  }, [error, reset]);
  return (
    <div className="empty-state">
      <p>Something went wrong.</p>
      <button className="btn" onClick={() => window.location.reload()}>Reload</button>
    </div>
  );
}
