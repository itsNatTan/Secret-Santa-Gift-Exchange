import { NextResponse } from "next/server";
import { database, currentAdminEvent, getSettings, deadlinePassed, newToken, hashToken, siteUrl, sendEmail, escapeHtml } from "@/lib/server";
import { IMPORT_BATCH_SIZE, rosterPerson, type RosterPerson } from "@/lib/roster-import";

export const maxDuration = 60;
const noStore = { headers: { "Cache-Control": "no-store" } };
export async function POST(req: Request) {
  const eventId = await currentAdminEvent();
  if (!eventId) return NextResponse.json({ error: "Not authorised." }, { status: 401, ...noStore });
  try {
    const body = await req.json();
    if (!Array.isArray(body.participants) || !body.participants.length || body.participants.length > IMPORT_BATCH_SIZE) {
      return NextResponse.json({ error: `Import 1–${IMPORT_BATCH_SIZE} people per batch.` }, { status: 400, ...noStore });
    }
    let people: RosterPerson[];
    try { people = body.participants.map(rosterPerson); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Check the names and emails." }, { status: 400, ...noStore }); }
    if (new Set(people.map(person => person.email)).size !== people.length) {
      return NextResponse.json({ error: "Each email address must appear only once per batch." }, { status: 400, ...noStore });
    }
    const settings = await getSettings(eventId);
    if (!settings.registration_open || settings.assignments_generated || deadlinePassed(settings.registration_deadline)) {
      return NextResponse.json({ error: "Import is only available while registration is open, before the deadline and before generating a draw." }, { status: 403, ...noStore });
    }
    const origin = siteUrl(req.url), db = database();
    const { data: registered, error: lookupError } = await db.from("participants").select("email").eq("event_id", eventId);
    if (lookupError) throw lookupError;
    const existingEmails = new Set((registered || []).map(person => person.email.trim().toLowerCase()));
    const results = await Promise.all(people.map(async person => {
      if (existingEmails.has(person.email)) return { ...person, status: "existing" as const };
      const token = newToken(), editUrl = `${origin}/edit?token=${token}`;
      try {
        // Insert, never upsert: the unique event/email constraint also protects
        // existing preferences and tokens during concurrent/repeated imports.
        const { error } = await db.from("participants").insert({ ...person, event_id: eventId,
          categories: [], likes: "", dislikes: "", edit_token_hash: hashToken(token) });
        if (error?.code === "23505") return { ...person, status: "existing" as const };
        if (error) {
          console.error("Participant import insert failed", error);
          return { ...person, status: "failed" as const, error: error.message.includes("Registration is closed") ? "Registration closed before this person could be added." : "Could not register this person. Retry the import." };
        }
        try {
          await sendEmail(person.email, `Your ${settings.name} registration`, `<p>Hi ${escapeHtml(person.name)},</p><p>Your organiser registered you for ${escapeHtml(settings.name)}.</p><p>Your gift preferences are currently blank. <a href="${escapeHtml(editUrl)}">Add your preferences or edit your registration</a> before registration closes.</p><p>Keep this link private.</p>`);
          return { ...person, status: "registered" as const, emailSent: true };
        } catch (error) {
          console.error("Imported registration email failed", error);
          return { ...person, status: "registered" as const, emailSent: false, editUrl };
        }
      } catch (error) {
        console.error("Participant import failed", error);
        return { ...person, status: "failed" as const, error: "Request failed. Refresh the participant list before retrying; registration may have been saved." };
      }
    }));
    return NextResponse.json({ results }, noStore);
  } catch (error) {
    console.error("Participant import request failed", error);
    return NextResponse.json({ error: "Unable to import participants. Refresh the participant list before retrying." }, { status: 500, ...noStore });
  }
}
