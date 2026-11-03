import { NextResponse } from "next/server";
import { database, currentAdminEvent } from "@/lib/server";
export async function POST(req: Request) {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const b = await req.json(), deadline = b.registration_deadline ? new Date(b.registration_deadline) : null;
    if (deadline && isNaN(deadline.getTime())) return NextResponse.json({ error: "Enter a valid deadline." }, { status: 400 });
    const { error } = await database().from("events").update({ gift_budget: String(b.gift_budget || "").slice(0, 100), exchange_date: String(b.exchange_date || "").slice(0, 100), registration_deadline: deadline?.toISOString() || null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ message: "Event settings saved." });
  } catch { return NextResponse.json({ error: "Unable to save event settings." }, { status: 500 }); }
}
