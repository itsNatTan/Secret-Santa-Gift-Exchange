import { NextResponse } from "next/server";
import { database, currentAdminEvent } from "@/lib/server";
import { makeSecretSanta } from "@/lib/matching";
import { deliverAssignments } from "@/lib/assignment-email";
export const maxDuration = 60;
export async function POST() {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const { data: people, error } = await database().from("participants").select("id").eq("event_id", id);
    if (error) throw error;
    if (!people || people.length < 3) return NextResponse.json({ error: "At least 3 participants are required." }, { status: 400 });
    const pairs = makeSecretSanta(people.map(p => p.id));
    // The database locks this event and commits assignments + closure together.
    const { error: drawError } = await database().rpc("commit_draw", { target_event: id, pairs });
    if (drawError) return NextResponse.json({ error: "Draw could not be saved. It may already exist or the participant list changed. Refresh and try again." }, { status: 409 });
    try { return NextResponse.json({ message: `Draw saved. ${await deliverAssignments(id)}` }); }
    catch (error) {
      console.error("Draw email delivery failed", error);
      return NextResponse.json({ message: "Draw saved. Email delivery could not complete; use Send pending emails to retry." });
    }
  } catch (error) {
    console.error("Draw failed", error);
    return NextResponse.json({ error: "Unable to generate the draw." }, { status: 500 });
  }
}
