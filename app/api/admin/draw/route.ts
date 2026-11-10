import { NextResponse } from "next/server";
import { database, currentAdminEvent } from "@/lib/server";
import { DrawConstraintError, makeSecretSanta, parseForcedPairs } from "@/lib/matching";
export const maxDuration = 60;
export async function POST() {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const { data: people, error } = await database().from("participants").select("id").eq("event_id", id);
    if (error) throw error;
    if (!people || people.length < 3) return NextResponse.json({ error: "At least 3 participants are required." }, { status: 400 });
    const { data: constraints, error: constraintsError } = await database().from("events").select("forced_pairs").eq("id", id).single();
    if (constraintsError) throw constraintsError;
    const pairs = makeSecretSanta(people.map(p => p.id), parseForcedPairs(constraints.forced_pairs));
    // The database locks this event and commits assignments + closure together.
    const { error: drawError } = await database().rpc("commit_draw", { target_event: id, pairs });
    if (drawError) return NextResponse.json({ error: "Draw could not be saved. It may already exist, or participants or forced pairings changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ message: "Draft draw generated. Review and edit the assignments below, then confirm to send emails. No assignment emails have been sent." });
  } catch (error) {
    if (error instanceof DrawConstraintError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Draw failed", error);
    return NextResponse.json({ error: "Unable to generate the draw." }, { status: 500 });
  }
}
