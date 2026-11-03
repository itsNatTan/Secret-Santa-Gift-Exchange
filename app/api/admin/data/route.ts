import { NextResponse } from "next/server";
import { database, currentAdminEvent, getSettings } from "@/lib/server";
export async function GET() {
  const id = await currentAdminEvent();
  if (!id) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  try {
    const [{ data, error }, settings, deliveries] = await Promise.all([
      database().from("participants").select("id,name,email,categories,wishlist_links,likes,dislikes,created_at").eq("event_id", id).order("created_at"),
      getSettings(id), database().from("assignments").select("giver_id,emailed_at").eq("event_id", id)
    ]);
    if (error || deliveries.error) throw error || deliveries.error;
    return NextResponse.json({ participants: data, settings, deliveries: deliveries.data }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "Unable to load event." }, { status: 500 }); }
}
