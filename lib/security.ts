import { createHmac, randomBytes, createHash, timingSafeEqual } from "crypto";

export function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
export function newToken() { return randomBytes(32).toString("hex"); }
export function newJoinCode() { return randomBytes(6).toString("hex").toUpperCase(); }
export function normalizeCode(code: string) { return code.trim().replace(/[\s-]/g, "").toUpperCase(); }
export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function adminCookieValue(eventId: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("ADMIN_SESSION_SECRET is not configured.");
  const payload = `${eventId}.${Math.floor(Date.now() / 1000) + 8 * 3600}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}
export function adminEventId(value?: string) {
  if (!value || !process.env.ADMIN_SESSION_SECRET) return null;
  const [id, expiry, signature, extra] = value.split(".");
  if (extra || !id || !expiry || !signature || !Number.isFinite(Number(expiry)) || Number(expiry) <= Date.now() / 1000) return null;
  const expected = createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(`${id}.${expiry}`).digest("hex");
  return safeEqual(signature, expected) ? id : null;
}
