import { NextResponse } from "next/server";
import { database, currentAdminEvent, getSettings } from "@/lib/server";
export async function GET() {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const [{ data, error }, settings, deliveries, constraints] = await Promise.all([
      database().from("participants").select("id,name,email,categories,likes,dislikes,created_at").eq("event_id", id).order("created_at"),
      getSettings(id), database().from("assignments").select("giver_id,recipient_id,emailed_at").eq("event_id", id),
      database().from("events").select("forced_pairs,draw_confirmed,draw_revision").eq("id", id).single()
    ]);
    if (error || deliveries.error || constraints.error) throw error || deliveries.error || constraints.error;
    return NextResponse.json({ participants: data, settings, deliveries: deliveries.data, forcedPairs: constraints.data.forced_pairs,
      drawConfirmed: constraints.data.draw_confirmed, drawRevision: constraints.data.draw_revision }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to load event." }, { status: 500 }); }
}
