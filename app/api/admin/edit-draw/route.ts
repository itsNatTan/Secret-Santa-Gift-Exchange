import { NextResponse } from "next/server";
import { currentAdminEvent, database } from "@/lib/server";
import { DrawConstraintError, makeSecretSanta, parseForcedPairs } from "@/lib/matching";

export async function POST(req: Request) {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const body = await req.json();
    if (!Number.isSafeInteger(body.revision) || body.revision < 1) return NextResponse.json({ error: "Refresh the draft before saving." }, { status: 400 });
    const pairs = parseForcedPairs(body.pairs), db = database();
    const { data: people, error } = await db.from("participants").select("id").eq("event_id", id);
    if (error) throw error;
    if (pairs.length !== people?.length) return NextResponse.json({ error: "Assign one recipient to every giver." }, { status: 400 });
    makeSecretSanta(people.map(person => person.id), pairs);
    const { error: saveError } = await db.rpc("edit_draft_draw", { target_event: id, pairs, expected_revision: body.revision });
    if (saveError) return NextResponse.json({ error: "Draft could not be saved. It may have changed or been confirmed. Refresh before trying again." }, { status: 409 });
    return NextResponse.json({ message: "Draft changes saved. No assignment emails have been sent." });
  } catch (error) {
    if (error instanceof DrawConstraintError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("Edit draft failed", error);
    return NextResponse.json({ error: "Unable to save the draft." }, { status: 500 });
  }
}
