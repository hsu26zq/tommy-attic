import { env } from "./env.js";

// Login alert emails. Does nothing until RESEND_API_KEY and ALERT_EMAIL are set.
export async function sendLoginAlert(info: { method: string; trusted: boolean; device: string | null; userAgent: string; ip: string }) {
  if (!env.resendKey || !env.alertEmail) {
    console.log("[alert] login (email not configured)", info);
    return;
  }
  const when = new Date().toUTCString();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.alertFrom,
      to: [env.alertEmail],
      subject: info.trusted ? `New login · ${info.device ?? "trusted device"}` : "New login · untrusted device",
      text:
        `Someone logged in to your site.\n\n` +
        `When: ${when}\nDevice: ${info.trusted ? `${info.device} (trusted)` : "not trusted"}\nMethod: ${info.method}\nBrowser: ${info.userAgent}\nIP: ${info.ip}\n\n` +
        `If this wasn't you, open Settings → Devices and click "Log out everywhere".`,
    }),
  });
  if (!res.ok) console.error("[alert] email failed", res.status, await res.text());
}
