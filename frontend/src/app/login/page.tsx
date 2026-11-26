"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as WebAuthn from "@simplewebauthn/browser";
import { supabase } from "@/lib/supabase";
import { afterLogin } from "@/lib/afterLogin";
import QrLogin from "@/components/QrLogin";

// Where to go after login (only paths on this site)
function nextPath() {
  const n = new URLSearchParams(window.location.search).get("next") ?? "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/edit";
}

type PasskeyApi = {
  startAuthentication: () => Promise<{ data: { options: unknown; challenge_id: string } | null; error: Error | null }>;
  verifyAuthentication: (a: { challengeId: string; credential: unknown }) => Promise<{ error: Error | null }>;
};

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [idle, setIdle] = useState(false);

  // Coming back from an email login link: the session is picked up from the URL automatically.
  useEffect(() => {
    setIdle(new URLSearchParams(window.location.search).has("idle"));
    const sb = supabase();
    const fromLink = window.location.hash.includes("access_token");
    sb.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        if (fromLink) void afterLogin("email-link");
        router.replace(nextPath());
      }
    });
  }, [router]);

  async function passkeyLogin() {
    setError("");
    setBusy(true);
    setStatus("Waiting for your passkey…");
    try {
      const passkey = (supabase().auth as unknown as { passkey: PasskeyApi }).passkey;
      const { data, error: startError } = await passkey.startAuthentication();
      if (startError || !data) throw startError ?? new Error("Could not start passkey login");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const credential = await WebAuthn.startAuthentication({ optionsJSON: data.options as any });
      const { error: verifyError } = await passkey.verifyAuthentication({ challengeId: data.challenge_id, credential });
      if (verifyError) throw verifyError;
      // "platform" = this device's own Face ID / Touch ID; "cross-platform" = phone QR scan or security key
      void afterLogin(credential.authenticatorAttachment ?? "unknown"); // runs in background, no waiting
      router.replace(nextPath());
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "Passkey login failed");
    } finally {
      setBusy(false);
    }
  }




  // One way in: scan the QR with your iPhone. On the iPhone itself (it can't scan its own screen), use Face ID.
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => setIsPhone(/iPhone|iPad|Android/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))), []);

  return (
    <div className="auth-wrap">
      <div className="auth-box" style={{ textAlign: "center" }}>
        <h1 style={{ marginTop: 0 }}>Log in</h1>
        {idle && <div className="notice">You were logged out after 30 minutes without activity.</div>}
        {isPhone ? (
          <button className="btn" onClick={passkeyLogin} disabled={busy} style={{ width: "100%" }}>
            Log in with Face ID
          </button>
        ) : (
          <QrLogin onDone={() => router.replace(nextPath())} />
        )}
        {status && <div className="notice ok">{status}</div>}
        {error && <div className="notice">{error}</div>}
      </div>
    </div>
  );
}
