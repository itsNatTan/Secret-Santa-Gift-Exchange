import { NextResponse } from "next/server";
import { currentAdminEvent, database } from "@/lib/server";
import { DrawConstraintError, makeSecretSanta, parseForcedPairs } from "@/lib/matching";

export async function POST(req: Request) {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const body = await req.json(), pairs = parseForcedPairs(body.forced_pairs);
    const db = database();
    if (pairs.length) {
      const { data: people, error } = await db.from("participants").select("id").eq("event_id", id);
      if (error) throw error;
      makeSecretSanta((people || []).map(person => person.id), pairs);
    }
    // Conditional update serializes with commit_draw's event lock. A saved draw
    // cannot have its pairings changed, even by an overlapping admin request.
    const { data, error } = await db.from("events").update({ forced_pairs: pairs, updated_at: new Date().toISOString() })
      .eq("id", id).eq("assignments_generated", false).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "The draw has already been generated. Forced pairings cannot be changed." }, { status: 409 });
    return NextResponse.json({ message: "Forced pairings saved. They will be honoured when you generate the draw." });
  } catch (error) {
    if (error instanceof DrawConstraintError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Save forced pairings failed", error);
    return NextResponse.json({ error: "Unable to save forced pairings. Check that the forced-pairings database migration has been applied." }, { status: 500 });
  }
}
