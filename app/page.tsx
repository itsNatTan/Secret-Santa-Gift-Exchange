import { db, getSettings, deadlinePassed } from "@/lib/server";
import SignupForm from "./signup-form";

export const dynamic = "force-dynamic";
export default async function Home() {
  let settings: any = { gift_budget: "S$20–30", exchange_date: "", registration_deadline: null, registration_open: true };
  let count = 0;
  try {
    settings = await getSettings();
    const { count: n } = await db.from("participants").select("*", { count: "exact", head: true });
    count = n || 0;
  } catch {}
  const closed = !settings.registration_open || deadlinePassed(settings.registration_deadline) || settings.assignments_generated;
  return <main>
    <div className="card">
      <p className="small">NSCC · FESTIVE SEASON</p>
      <h1>🎁 NSCC Gift Exchange</h1>
      <p>A little something for the festive season. Sign up, share a few gift ideas, and we'll randomly pair everyone for a bit of Secret Santa fun.</p>
      <div className="notice">
        <strong>Suggested gift budget:</strong> {settings.gift_budget || "To be confirmed"}<br/>
        <strong>Gift exchange date:</strong> {settings.exchange_date || "To be confirmed"}<br/>
        <strong>Registration deadline:</strong> {settings.registration_deadline ? new Date(settings.registration_deadline).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" }) : "To be announced"}
      </div>
      <p className="small">{count} participant{count === 1 ? "" : "s"} registered</p>
    </div>
    {closed ? <div className="card"><h2>Registration is closed</h2><p>Thanks for your interest! Registration is no longer accepting changes.</p></div> : <SignupForm />}
    <p className="small" style={{textAlign:"center"}}>Your registration and wishlist are only visible to the event organiser and used for this gift exchange.</p>
  </main>;
}
