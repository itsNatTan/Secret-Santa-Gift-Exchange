import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { adminEventId } from "./security";
export { hashToken, newToken, newJoinCode, normalizeCode, safeEqual, adminCookieValue, adminEventId } from "./security";
import { cookies } from "next/headers";

export function database() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } });
}
export const LEGACY_EVENT_ID = "00000000-0000-4000-8000-000000000001";
export type Exchange = {
  id: string; name: string; join_code: string; gift_budget: string; exchange_date: string;
  registration_deadline: string | null; registration_open: boolean; assignments_generated: boolean;
};
export const publicEventFields = "id,name,join_code,gift_budget,exchange_date,registration_deadline,registration_open,assignments_generated";
export async function currentAdminEvent() { return adminEventId((await cookies()).get("nscc_admin")?.value); }
export const adminCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/", maxAge: 8 * 3600 };
export async function sendEmail(to: string, subject: string, html: string) {
  const user = process.env.GOOGLE_SMTP_USER, pass = process.env.GOOGLE_SMTP_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) throw new Error("Google SMTP is not configured.");
  const mailer = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
  await mailer.sendMail({ from: { name: "Gift Exchange", address: user }, to: { address: to, name: "" }, subject, html });
}
export async function getSettings(eventId: string): Promise<Exchange> {
  const { data, error } = await database().from("events").select(publicEventFields).eq("id", eventId).single();
  if (error) throw error;
  return data;
}
export function deadlinePassed(deadline: string | null) { return !!deadline && Date.now() >= new Date(deadline).getTime(); }
export function escapeHtml(s: string) { return s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)); }
export function siteUrl() {
  if (!process.env.NEXT_PUBLIC_SITE_URL) throw new Error("NEXT_PUBLIC_SITE_URL is not configured.");
  return new URL(process.env.NEXT_PUBLIC_SITE_URL).origin;
}
