import { NextResponse } from "next/server";
import { currentAdminEvent } from "@/lib/server";
import { deliverAssignments } from "@/lib/assignment-email";
export const maxDuration = 60;
export async function POST() {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try { return NextResponse.json({ message: await deliverAssignments(id) }); }
  catch { return NextResponse.json({ error: "Unable to send emails. Please try again." }, { status: 500 }); }
}
