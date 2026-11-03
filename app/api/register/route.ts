import { NextResponse } from "next/server";
import { database, getSettings, deadlinePassed, newToken, hashToken, sendEmail, escapeHtml, siteUrl } from "@/lib/server";
import { participantDetails } from "@/lib/participant";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (typeof b.event_id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.event_id)) return NextResponse.json({ error: "Choose an event first." }, { status: 400 });
    const s = await getSettings(b.event_id);
    if (!s.registration_open || s.assignments_generated || deadlinePassed(s.registration_deadline)) return NextResponse.json({ error: "Registration is closed." }, { status: 403 });
    const details = participantDetails(b), email = String(b.email || "").trim().toLowerCase();
    if (!details.name || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Please provide a valid name and email." }, { status: 400 });
    const token = newToken(), editUrl = `${siteUrl()}/edit?token=${token}`;
    const { error } = await database().from("participants").insert({ ...details, email, event_id: s.id, edit_token_hash: hashToken(token) });
    if (error?.code === "23505") return NextResponse.json({ error: "This email is already registered for this event. Use your existing edit link or contact the organiser." }, { status: 409 });
    if (error?.message.includes("Registration is closed")) return NextResponse.json({ error: "Registration is closed." }, { status: 403 });
    if (error) throw error;
    let emailSent = true;
    try {
      await sendEmail(email, `Your ${s.name} registration`, `<p>Hi ${escapeHtml(details.name)},</p><p>You're registered for ${escapeHtml(s.name)}!</p><p><a href="${escapeHtml(editUrl)}">Edit your registration</a> before registration closes.</p><p>Keep this link private.</p>`);
    } catch (error) { emailSent = false; console.error("Registration email failed", error); }
    return NextResponse.json({ message: emailSent ? "You're registered! Check your email and save your private edit link below." : "You're registered, but the confirmation email could not be sent. Save your private edit link below.", editUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Registration failed", error);
    return NextResponse.json({ error: "Unable to register. Please try again." }, { status: 500 });
  }
}
