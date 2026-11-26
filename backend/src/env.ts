// All settings come from environment variables, so nothing secret lives in the code.
function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT ?? 8080),
  supabaseUrl: need("SUPABASE_URL"),
  supabaseKey: need("SUPABASE_PUBLISHABLE_KEY"),
  // Optional: needed only for QR login (creates the login on the computer after your phone approves)
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY ?? "",
  // Optional: login alert emails through Resend
  resendKey: process.env.RESEND_API_KEY ?? "",
  alertEmail: process.env.ALERT_EMAIL ?? "",
  alertFrom: process.env.ALERT_FROM ?? "Tommy's Attic <onboarding@resend.dev>",
  // Cookies are only marked Secure in production (https)
  secureCookies: process.env.NODE_ENV !== "development",
};
