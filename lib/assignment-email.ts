import { database, getSettings, sendEmail, escapeHtml } from "./server";

// Send a bounded batch so a large exchange can continue in another Vercel request.
export async function deliverAssignments(eventId: string) {
  const db = database(), settings = await getSettings(eventId);
  const [{ data: assignments, error }, { data: people, error: peopleError }] = await Promise.all([
    db.rpc("claim_assignment_emails", { target_event: eventId }),
    db.from("participants").select("id,name,email,categories,likes,dislikes").eq("event_id", eventId)
  ]);
  if (error || peopleError) throw error || peopleError;
  const byId = new Map((people || []).map(p => [p.id, p]));
  const outcomes = await Promise.allSettled((assignments || []).map(async (a: { id: string; giver_id: string; recipient_id: string }) => {
    try {
      const giver = byId.get(a.giver_id), recipient = byId.get(a.recipient_id);
      if (!giver || !recipient) throw new Error("Participant not found.");
      await sendEmail(giver.email, `Your ${settings.name} assignment`, `<p>Hi ${escapeHtml(giver.name)},</p><p>Your recipient for ${escapeHtml(settings.name)} is:</p><h2>${escapeHtml(recipient.name)}</h2><p><strong>Gift categories:</strong> ${escapeHtml((recipient.categories || []).join(", ") || "No preference provided")}</p><p><strong>Things they like:</strong> ${escapeHtml(recipient.likes || "Not specified")}</p><p><strong>Prefer not to receive:</strong> ${escapeHtml(recipient.dislikes || "Not specified")}</p><p>Suggested budget: ${escapeHtml(settings.gift_budget || "To be confirmed")}<br/>Exchange date: ${escapeHtml(settings.exchange_date || "To be confirmed")}</p><p>Please keep your assignment secret. Happy gifting!</p>`);
      const { error: updateError } = await db.from("assignments").update({ emailed_at: new Date().toISOString() }).eq("id", a.id).eq("event_id", eventId);
      if (updateError) throw updateError;
    } catch (error) {
      await db.from("assignments").update({ email_claimed_at: null }).eq("id", a.id).eq("event_id", eventId);
      throw error;
    }
  }));
  const failed = outcomes.filter(x => x.status === "rejected").length;
  outcomes.forEach(x => { if (x.status === "rejected") console.error("Assignment email failed", x.reason); });
  return `${outcomes.length - failed} assignment email(s) sent${failed ? `; ${failed} failed` : ""}. Use Send pending emails to continue or retry. The draw stays the same.`;
}
