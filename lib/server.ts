import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { createHmac, randomBytes, createHash, timingSafeEqual } from "crypto";

export const db = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);
export const mailer = new Resend(process.env.RESEND_API_KEY);

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function newToken() {
  return randomBytes(32).toString("hex");
}
export function adminCookieValue() {
  const payload = "nscc-admin";
  const sig = createHmac("sha256", process.env.ADMIN_SESSION_SECRET!).update(payload).digest("hex");
  return `${payload}.${sig}`;
}
export function isAdminCookie(value?: string) {
  if (!value || !process.env.ADMIN_SESSION_SECRET) return false;
  const expected = adminCookieValue();
  const a = Buffer.from(value), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function sendEmail(to: string, subject: string, html: string) {
  const from = process.env.EMAIL_FROM;
  if (!from || !process.env.RESEND_API_KEY) throw new Error("Email service is not configured.");
  const { error } = await mailer.emails.send({ from, to, subject, html });
  if (error) throw new Error(error.message);
}
export async function getSettings() {
  const { data, error } = await db.from("event_settings").select("*").eq("id", 1).single();
  if (error) throw error;
  return data;
}
export function deadlinePassed(deadline: string | null) {
  return !!deadline && Date.now() >= new Date(deadline).getTime();
}
