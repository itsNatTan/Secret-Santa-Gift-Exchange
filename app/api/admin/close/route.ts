import { NextResponse } from "next/server";
import { database, currentAdminEvent } from "@/lib/server";
export async function POST() {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  const { error } = await database().from("events").update({ registration_open: false, updated_at: new Date().toISOString() }).eq("id", id);
  return error ? NextResponse.json({ error: "Unable to close registration." }, { status: 500 }) : NextResponse.json({ message: "Registration is now closed." });
}
