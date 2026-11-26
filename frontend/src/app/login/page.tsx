"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as WebAuthn from "@simplewebauthn/browser";
import { supabase } from "@/lib/supabase";
import { afterLogin } from "@/lib/afterLogin";

type PasskeyApi = {
  startAuthentication: () => Promise<{ data: { options: unknown; challenge_id: string } | null; error: Error | null }>;
  verifyAuthentication: (a: { challengeId: string; credential: unknown }) => Promise<{ error: Error | null }>;
};

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [idle, setIdle] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");

  // Coming back from an email login link: the session is picked up from the URL automatically.
  useEffect(() => {
    setIdle(new URLSearchParams(window.location.search).has("idle"));
    const sb = supabase();
    const fromLink = window.location.hash.includes("access_token");
    sb.auth.getSession().then(async ({ data }) => {
      if (data.session) {
        if (fromLink) await afterLogin("email-link");
        router.replace("/edit");
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
      await afterLogin(credential.authenticatorAttachment ?? "unknown");
      router.replace("/edit");
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "Passkey login failed");
    } finally {
      setBusy(false);
    }
  }

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await supabase().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/login`, shouldCreateUser: false },
    });
    setBusy(false);
    if (err) setError(err.message);
    else {
      setCodeSent(true);
      setStatus("Email sent. Type the code from the email here (or open the link on this device).");
    }
  }

  // The code from the email can be read on your phone and typed on this computer.
  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const { error: err } = await supabase().auth.verifyOtp({ email, token: code.trim(), type: "email" });
    if (err) {
      setBusy(false);
      setError(err.message.includes("expired") || err.message.includes("invalid") ? "That code is wrong or expired." : err.message);
      return;
    }
    await afterLogin("email-code");
    router.replace("/edit");
  }

  return (
    <div className="container">
      <div className="login-box card">
        <h1 style={{ marginTop: 0 }}>Log in</h1>
        {idle && <div className="notice">You were logged out after 30 minutes without activity.</div>}
        <p className="muted small">Only Tommy can log in here.</p>
        <button className="btn" onClick={passkeyLogin} disabled={busy}>
          Log in with passkey
        </button>
        <p className="muted small">On someone else&apos;s computer, choose your phone and scan the QR code.</p>

        <div className="divider">or log in by email</div>
        <form onSubmit={emailLogin} className="row">
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button className="btn secondary" disabled={busy}>{codeSent ? "Resend" : "Email me a code"}</button>
        </form>
        {codeSent && (
          <form onSubmit={verifyCode} className="row" style={{ marginTop: 10 }}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="Code from email"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              maxLength={10}
              required
              autoFocus
            />
            <button className="btn" disabled={busy || code.length < 6}>Log in</button>
          </form>
        )}

        {status && <div className="notice ok">{status}</div>}
        {error && <div className="notice">{error}</div>}
      </div>
    </div>
  );
}
