import { NextResponse } from "next/server";
import { currentAdminEvent, database } from "@/lib/server";
import { deliverAssignments } from "@/lib/assignment-email";

export const maxDuration = 60;
export async function POST(req: Request) {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const body = await req.json();
    if (!Number.isSafeInteger(body.revision) || body.revision < 1) return NextResponse.json({ error: "Refresh and review the draft before confirming." }, { status: 400 });
    const { error } = await database().rpc("confirm_draw", { target_event: id, expected_revision: body.revision });
    if (error) return NextResponse.json({ error: "The draft changed or was already confirmed. Refresh and review it before sending." }, { status: 409 });
    try { return NextResponse.json({ message: `Draw confirmed. ${await deliverAssignments(id)}` }); }
    catch (error) {
      console.error("Confirmed draw email failed", error);
      return NextResponse.json({ message: "Draw confirmed. Email delivery could not complete; use Send pending emails to retry." });
    }
  } catch (error) {
    console.error("Confirm draw failed", error);
    return NextResponse.json({ error: "Unable to confirm the draft." }, { status: 500 });
  }
}
