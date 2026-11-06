import { NextResponse } from "next/server";
import { database, getSettings, deadlinePassed, hashToken } from "@/lib/server";
import { participantDetails } from "@/lib/participant";
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  if (!token) return NextResponse.json({ error: "Missing edit token." }, { status: 400 });
  const { data, error } = await database().from("participants").select("name,email,categories,likes,dislikes,event_id").eq("edit_token_hash", hashToken(token)).maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Invalid edit link." }, { status: 404 });
  return NextResponse.json({ participant: data }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(req: Request) {
  try {
    const b = await req.json(), token = String(b.token || "");
    const { data: person, error: lookupError } = await database().from("participants").select("id,event_id").eq("edit_token_hash", hashToken(token)).maybeSingle();
    if (!token || lookupError || !person) return NextResponse.json({ error: "Invalid edit link." }, { status: 404 });
    const s = await getSettings(person.event_id);
    if (!s.registration_open || s.assignments_generated || deadlinePassed(s.registration_deadline)) return NextResponse.json({ error: "Registration is closed; edits are no longer allowed." }, { status: 403 });
    const patch = participantDetails(b);
    if (!patch.name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
    const { error } = await database().from("participants").update(patch).eq("id", person.id).eq("event_id", person.event_id);
    if (error?.message.includes("Registration is closed")) return NextResponse.json({ error: "Registration is closed; edits are no longer allowed." }, { status: 403 });
    if (error) throw error;
    return NextResponse.json({ message: "Your details have been updated." });
  } catch { return NextResponse.json({ error: "Unable to save changes." }, { status: 500 }); }
}
