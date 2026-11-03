import { NextResponse } from "next/server";
import { database, newToken, hashToken, newJoinCode, publicEventFields, adminCookieValue, adminCookieOptions } from "@/lib/server";
export async function POST(req: Request) {
  try {
    const b = await req.json(), name = String(b.name || "").trim();
    if (!name || name.length > 100) return NextResponse.json({ error: "Enter an event name (up to 100 characters)." }, { status: 400 });
    const adminCode = newToken();
    adminCookieValue("configuration-check");
    const { data, error } = await database().from("events").insert({ name, join_code: newJoinCode(), admin_code_hash: hashToken(adminCode) }).select(publicEventFields).single();
    if (error) throw error;
    const response = NextResponse.json({ event: data, adminCode }, { status: 201, headers: { "Cache-Control": "no-store" } });
    response.cookies.set("nscc_admin", adminCookieValue(data.id), adminCookieOptions);
    return response;
  } catch (error) {
    console.error("Event creation failed", error);
    return NextResponse.json({ error: "Unable to create the event. Please try again." }, { status: 500 });
  }
}
