import { NextResponse } from "next/server";
import { currentAdminEvent, database } from "@/lib/server";
import { deliverAssignments } from "@/lib/assignment-email";
export const maxDuration = 60;
export async function POST() {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const { data, error } = await database().from("events").select("draw_confirmed").eq("id", id).single();
    if (error) throw error;
    if (!data.draw_confirmed) return NextResponse.json({ error: "Review and confirm the draft before sending assignment emails." }, { status: 409 });
    return NextResponse.json({ message: await deliverAssignments(id) });
  }
  catch { return NextResponse.json({ error: "Unable to send emails. Please try again." }, { status: 500 }); }
}
