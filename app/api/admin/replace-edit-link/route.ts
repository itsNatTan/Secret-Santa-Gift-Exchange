import { NextResponse } from "next/server";
import { currentAdminEvent, database, getSettings, deadlinePassed, newToken, hashToken, siteUrl, sendEmail, escapeHtml } from "@/lib/server";

export const maxDuration = 60;
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function POST(req: Request) {
  const eventId = await currentAdminEvent();
  if (!eventId) return NextResponse.json({ error: "Not authorised." }, { status: 401, ...noStore });
  try {
    const body = await req.json();
    if (typeof body.participant_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.participant_id)) {
      return NextResponse.json({ error: "Choose a valid participant." }, { status: 400, ...noStore });
    }
    const settings = await getSettings(eventId);
    if (!settings.registration_open || settings.assignments_generated || deadlinePassed(settings.registration_deadline)) {
      return NextResponse.json({ error: "Registration is closed; edit links cannot be replaced." }, { status: 403, ...noStore });
    }
    const token = newToken(), editUrl = `${siteUrl(req.url)}/edit?token=${token}`;
    const { data: participant, error } = await database().from("participants")
      .update({ edit_token_hash: hashToken(token), updated_at: new Date().toISOString() })
      .eq("id", body.participant_id).eq("event_id", eventId).select("name,email").maybeSingle();
    // The database guard also checks registration under the event lock.
    if (error?.message.includes("Registration is closed")) {
      return NextResponse.json({ error: "Registration is closed; edit links cannot be replaced." }, { status: 403, ...noStore });
    }
    if (error) throw error;
    if (!participant) return NextResponse.json({ error: "Participant not found in this event." }, { status: 404, ...noStore });

    let emailSent = true;
    try {
      await sendEmail(participant.email, `Your new ${settings.name} edit link`, `<p>Hi ${escapeHtml(participant.name)},</p><p>Your organiser generated a new edit link for ${escapeHtml(settings.name)}.</p><p><a href="${escapeHtml(editUrl)}">Edit your registration</a> before registration closes.</p><p>This replaces your previous edit link. Keep this link private.</p>`);
    } catch (error) {
      emailSent = false;
      console.error("Replacement edit link email failed", error);
    }
    return NextResponse.json({
      editUrl, emailSent,
      message: emailSent
        ? "New edit link generated and emailed. The previous link no longer works."
        : "New edit link generated, but the email could not be sent. Copy the link below and send it privately. The previous link no longer works."
    }, noStore);
  } catch (error) {
    console.error("Replacement edit link failed", error);
    return NextResponse.json({ error: "Unable to replace the edit link. Please try again." }, { status: 500, ...noStore });
  }
}
