import { NextResponse } from "next/server";
import { database, hashToken, safeEqual, normalizeCode, LEGACY_EVENT_ID, adminCookieValue, adminCookieOptions } from "@/lib/server";
export async function POST(req: Request) {
  try {
    const f = await req.formData(), code = normalizeCode(String(f.get("event_code") || "")), adminCode = String(f.get("admin_code") || "").trim();
    const { data, error } = await database().from("events").select("id,admin_code_hash").eq("join_code", code).maybeSingle();
    if (error) throw error;
    const expected = data?.admin_code_hash || (data?.id === LEGACY_EVENT_ID && process.env.ADMIN_PASSWORD ? hashToken(process.env.ADMIN_PASSWORD) : "");
    if (!expected || !safeEqual(hashToken(adminCode), expected)) return NextResponse.redirect(new URL("/admin?error=1", req.url), 303);
    const r = NextResponse.redirect(new URL("/admin", req.url), 303);
    r.cookies.set("nscc_admin", adminCookieValue(data!.id), adminCookieOptions);
    return r;
  } catch { return NextResponse.redirect(new URL("/admin?error=1", req.url), 303); }
}
