"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { afterLogin } from "@/lib/devices";

// One-time page: open the setup link on your iPhone, confirm with Face ID, and a new passkey is saved.
function Setup() {
  const code = useSearchParams().get("code") ?? "";
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    setStatus("Setting up…");
    try {
      const { tokenHash } = await api<{ tokenHash: string }>("/auth/qr/setup", { method: "POST", body: JSON.stringify({ code }) });
      const { error } = await supabase().auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
      if (error) throw error;
      setStatus("Confirm with Face ID…");
      const { error: regError } = await supabase().auth.registerPasskey();
      if (regError) throw regError;
      await afterLogin("passkey-setup");
      setStatus("Done. Your new passkey is saved.");
      setTimeout(() => router.replace("/edit"), 1200);
    } catch (e) {
      setStatus((e as Error).message || "Something went wrong");
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-box" style={{ textAlign: "center" }}>
        <h1>New passkey</h1>
        <p className="muted small">Open this on your iPhone. This link works once and expires in 30 minutes.</p>
        <button className="btn" onClick={go} disabled={busy || !code} style={{ width: "100%" }}>
          Set up Face ID
        </button>
        {status && <p className="muted small">{status}</p>}
      </div>
    </div>
  );
}

export default function SetupPage() {
  return (
    <Suspense>
      <Setup />
    </Suspense>
  );
}
