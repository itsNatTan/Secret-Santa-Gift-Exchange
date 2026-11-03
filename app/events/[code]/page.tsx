import Link from "next/link";
import { database, publicEventFields, normalizeCode, deadlinePassed } from "@/lib/server";
import SignupForm from "@/app/signup-form";
export const dynamic = "force-dynamic";
export default async function EventPage({ params }: { params: Promise<{ code: string }> }) {
  const code = normalizeCode((await params).code);
  const { data: settings, error } = await database().from("events").select(publicEventFields).eq("join_code", code).maybeSingle();
  if (error) return <main><div className="card"><h1>Unable to load this event</h1><p>Please try again shortly.</p><Link href="/">Back to home</Link></div></main>;
  if (!settings) return <main><div className="card"><h1>Event not found</h1><p>Check your event code with the organiser.</p><Link href="/">Try another code</Link></div></main>;
  const { count } = await database().from("participants").select("id", { count: "exact", head: true }).eq("event_id", settings.id);
  const closed = !settings.registration_open || deadlinePassed(settings.registration_deadline) || settings.assignments_generated;
  return <main><Link href="/">← All exchanges</Link><div className="card"><p className="small">GIFT EXCHANGE · {settings.join_code}</p><h1>🎁 {settings.name}</h1><p>Share a few ideas to help your Secret Santa choose something you'll enjoy.</p><div className="notice"><strong>Suggested gift budget:</strong> {settings.gift_budget || "To be confirmed"}<br/><strong>Exchange date:</strong> {settings.exchange_date || "To be confirmed"}<br/><strong>Registration deadline:</strong> {settings.registration_deadline ? new Date(settings.registration_deadline).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Singapore" }) + " (Singapore time)" : "To be announced"}</div><p className="small">{count ?? 0} participant(s) registered</p></div>
    {closed ? <div className="card"><h2>Registration is closed</h2><p>This exchange is no longer accepting registrations or changes.</p></div> : <SignupForm eventId={settings.id} />}
    <p className="small">Your details are visible to the organiser. Your gift preferences will be shared with your assigned Secret Santa.</p></main>;
}
