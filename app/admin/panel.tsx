"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Exchange } from "@/lib/server";
import { makeSecretSanta, type AssignmentPair } from "@/lib/matching";
type Participant = { id: string; name: string; email: string; categories: string[]; likes: string; dislikes: string };
type Dashboard = { settings: Exchange; participants: Participant[]; deliveries: { giver_id: string; recipient_id: string; emailed_at: string | null }[]; forcedPairs: AssignmentPair[]; drawConfirmed: boolean; drawRevision: number };
export default function AdminPanel() {
  const [data, setData] = useState<Dashboard | null>(null), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const [replacementLinks, setReplacementLinks] = useState<Record<string, { editUrl: string; message: string; emailSent: boolean }>>({});
  const [forcedPairs, setForcedPairs] = useState<AssignmentPair[]>([]);
  const [draftPairs, setDraftPairs] = useState<AssignmentPair[]>([]);
  async function replaceEditLink(participantId: string) {
    setBusy(true); setMsg("Generating a new edit link and sending email…");
    setReplacementLinks(current => {
      const next = { ...current };
      delete next[participantId];
      return next;
    });
    try {
      const response = await fetch("/api/admin/replace-edit-link", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participant_id: participantId })
      });
      const result = await response.json();
      if (!response.ok) { setMsg(result.error || "Unable to replace the edit link."); return; }
      setReplacementLinks(current => ({ ...current, [participantId]: result }));
      setMsg(result.message);
    } catch {
      setMsg("The request was interrupted; the link may have been replaced. If no email arrives, generate another replacement link.");
    } finally { setBusy(false); }
  }
  async function load() {
    const r = await fetch("/api/admin/data"), d = await r.json();
    if (!r.ok) throw new Error(d.error || "Unable to load event.");
    setData(d);
    setForcedPairs(d.forcedPairs);
    setDraftPairs(d.deliveries.map((pair: AssignmentPair) => ({ giver_id: pair.giver_id, recipient_id: pair.recipient_id })));
    return d as Dashboard;
  }
  useEffect(() => { load().catch(e => setMsg(e.message)); }, []);
  async function action(kind: string, body: Record<string, unknown> = {}) {
    setBusy(true); setMsg("Working…");
    try {
      const r = await fetch(`/api/admin/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), d = await r.json();
      setMsg(d.message || d.error || "Action failed."); if (r.ok) await load();
    } catch { setMsg("Unable to complete the request. Refresh to check its status before trying again."); }
    finally { setBusy(false); }
  }
  async function sendBlast(confirmDraft: boolean) {
    if (!data) return;
    setBusy(true); setMsg(confirmDraft ? "Confirming the draw and starting emails…" : "Sending pending emails…");
    let remaining = data.deliveries.filter(pair => !pair.emailed_at).length;
    try {
      let kind = confirmDraft ? "confirm-draw" : "send-pending";
      do {
        const response = await fetch(`/api/admin/${kind}`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(confirmDraft && kind === "confirm-draw" ? { revision: data.drawRevision } : {})
        });
        const result = await response.json();
        if (!response.ok) { setMsg(result.error || "Unable to send emails. Refresh to check the draw status."); return; }
        const latest = await load(), nextRemaining = latest.deliveries.filter(pair => !pair.emailed_at).length;
        if (nextRemaining === 0) { setMsg("Draw confirmed. All assignment emails have been sent."); return; }
        if (nextRemaining >= remaining) {
          setMsg(`${nextRemaining} email(s) still pending. Delivery failed or another request is sending them. Use Send pending emails to retry; after an interrupted request, wait two minutes.`);
          return;
        }
        remaining = nextRemaining; kind = "send-pending";
        setMsg(`Sending assignment emails… ${remaining} remaining. Keep this page open.`);
      } while (remaining > 0);
    } catch {
      setMsg("Sending was interrupted. Refresh to check progress, then use Send pending emails to continue. The confirmed draw stays locked.");
    } finally { setBusy(false); }
  }
  if (!data) return <div className="card"><h1>Admin dashboard</h1><p role="status">{msg || "Loading…"}</p><Link href="/admin">Reload</Link></div>;
  const pending = data.deliveries.filter(d => !d.emailed_at).length;
  const pairingsDirty = JSON.stringify(forcedPairs) !== JSON.stringify(data.forcedPairs);
  const savedPairs = data.deliveries.map(pair => ({ giver_id: pair.giver_id, recipient_id: pair.recipient_id }));
  const draftDirty = JSON.stringify(draftPairs) !== JSON.stringify(savedPairs);
  let draftError = "";
  if (data.settings.assignments_generated && !data.drawConfirmed) {
    try { makeSecretSanta(data.participants.map(person => person.id), draftPairs); }
    catch (error) { draftError = error instanceof Error ? error.message : "Check the draft pairings."; }
  }
  const editsOpen = data.settings.registration_open && !data.settings.assignments_generated &&
    (!data.settings.registration_deadline || Date.now() < new Date(data.settings.registration_deadline).getTime());
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); const f = new FormData(e.currentTarget), deadline = String(f.get("deadline") || "");
    await action("settings", { gift_budget: f.get("budget"), exchange_date: f.get("date"), registration_deadline: deadline ? new Date(deadline).toISOString() : null });
  }
  return <div className="card">
    <div className="row"><h1>{data.settings.name}</h1><button className="secondary" disabled={busy} onClick={async () => { setBusy(true); try { await fetch("/api/admin/logout", { method: "POST" }); location.reload(); } catch { setBusy(false); setMsg("Unable to log out. Please try again."); } }}>Log out</button></div>
    <p><Link href="/">Home / create another exchange</Link></p>
    <div className="notice"><strong>Join code: {data.settings.join_code}</strong><p><Link href={`/events/${data.settings.join_code}`}>Open join page</Link></p><label htmlFor="share-url">Share this URL with participants</label><input id="share-url" readOnly value={`${typeof window !== "undefined" ? location.origin : ""}/events/${data.settings.join_code}`} onFocus={e => e.target.select()}/></div>
    <p>{data.participants.length} registered participant(s)</p>
    <form onSubmit={save}>
      <label htmlFor="budget">Gift budget</label><input id="budget" name="budget" maxLength={100} defaultValue={data.settings.gift_budget}/>
      <label htmlFor="date">Gift exchange date</label><input id="date" name="date" maxLength={100} defaultValue={data.settings.exchange_date} placeholder="e.g. 18 December 2026"/>
      <label htmlFor="deadline">Registration deadline (your local time)</label><input id="deadline" name="deadline" type="datetime-local" defaultValue={data.settings.registration_deadline ? new Date(new Date(data.settings.registration_deadline).getTime() - new Date(data.settings.registration_deadline).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}/>
      <button className="secondary" disabled={busy}>Save event settings</button>
    </form>
    <p className="notice">Registration: {data.settings.registration_open ? "Open" : "Closed"} · Draw: {data.drawConfirmed ? "Confirmed" : data.settings.assignments_generated ? "Draft — awaiting review" : "Not generated"}</p>
    <h2>Participants</h2>
    {data.participants.map(p => <details key={p.id} className="participant">
      <summary><strong>{p.name}</strong> · {p.email}{data.settings.assignments_generated && <span className="small"> · {data.deliveries.find(d => d.giver_id === p.id)?.emailed_at ? "Email sent" : data.drawConfirmed ? "Email pending" : "Not sent (draft)"}</span>}</summary>
      <p>Categories: {p.categories.join(", ") || "None"}<br/>Likes: {p.likes || "None"}<br/>Prefer not to receive: {p.dislikes || "None"}</p>
      <button className="secondary" disabled={busy || !editsOpen} onClick={() => replaceEditLink(p.id)}>Generate new edit link & email</button>
      <p className="small">Replaces their previous edit link and emails the new one to {p.email}. Available while registration is open and before the deadline.</p>
      {replacementLinks[p.id] && <div className="notice">
        <p role="status">{replacementLinks[p.id].message}</p>
        <label htmlFor={`edit-link-${p.id}`}>Private edit link for {p.name}</label>
        <input id={`edit-link-${p.id}`} readOnly value={replacementLinks[p.id].editUrl} onFocus={e => e.target.select()}/>
        <button className="secondary" onClick={async () => {
          try { await navigator.clipboard.writeText(replacementLinks[p.id].editUrl); setMsg("Edit link copied. Send it privately to the participant."); }
          catch { setMsg("Select the edit link above and copy it manually."); }
        }}>Copy edit link</button>
        <p className="small">Save this link before leaving the dashboard; it is only shown here for this session.</p>
      </div>}
    </details>)}
    <h2>1. Set initial forced pairings</h2>
    <p>Save giver → recipient choices before generating the draft; everyone else will be assigned automatically. You can review and change any pairing in the draft before confirming.</p>
    {forcedPairs.map((pair, index) => <div className="participant" key={index}>
      <div className="grid">
        <div><label htmlFor={`forced-giver-${index}`}>Giver</label><select id={`forced-giver-${index}`} value={pair.giver_id} disabled={busy || data.settings.assignments_generated} onChange={e => setForcedPairs(current => current.map((item, i) => i === index ? { ...item, giver_id: e.target.value } : item))}>
          <option value="">Choose a giver</option>
          {data.participants.map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
        </select></div>
        <div><label htmlFor={`forced-recipient-${index}`}>Recipient</label><select id={`forced-recipient-${index}`} value={pair.recipient_id} disabled={busy || data.settings.assignments_generated} onChange={e => setForcedPairs(current => current.map((item, i) => i === index ? { ...item, recipient_id: e.target.value } : item))}>
          <option value="">Choose a recipient</option>
          {data.participants.filter(p => p.id !== pair.giver_id).map(p => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
        </select></div>
      </div>
      {!data.settings.assignments_generated && <div className="actions"><button className="secondary" disabled={busy} onClick={() => setForcedPairs(current => current.filter((_, i) => i !== index))}>Remove pairing</button></div>}
    </div>)}
    {!forcedPairs.length && <p className="small">No forced pairings. All participants will be assigned automatically.</p>}
    {!data.settings.assignments_generated && <div className="actions">
      <button className="secondary" disabled={busy || data.participants.length < 3 || forcedPairs.length >= data.participants.length} onClick={() => setForcedPairs(current => [...current, { giver_id: "", recipient_id: "" }])}>Add forced pairing</button>
      <button className="secondary" disabled={busy || !pairingsDirty} onClick={() => action("forced-pairs", { forced_pairs: forcedPairs })}>Save forced pairings</button>
    </div>}
    {pairingsDirty && <p className="notice" role="status">You have unsaved pairings. Save them before generating the draft.</p>}
    {data.settings.assignments_generated && <p className="small">These choices were used to generate the draft. Review the actual assignments below.</p>}
    <div className="actions">
      <button className="secondary" disabled={busy || !data.settings.registration_open} onClick={() => action("close")}>Close registration</button>
      {!data.settings.assignments_generated && <button disabled={busy || pairingsDirty || data.participants.length < 3} onClick={() => { if (confirm("Generate a draft and close registration? You can edit assignments before confirming. No assignment emails will be sent yet.")) action("draw"); }}>Generate draft draw</button>}
    </div>
    <h2>2. Review assignments</h2>
    {!data.settings.assignments_generated && <p>Generate the draft to review every giver and recipient here.</p>}
    {data.settings.assignments_generated && <>
      <p>{data.drawConfirmed ? "These assignments are confirmed and locked." : "Change recipients as needed, then save the draft. If you move a recipient, also update the other affected rows so everyone receives exactly once. No assignment emails are sent during review."}</p>
      {draftPairs.map((pair, index) => <div className="participant" key={pair.giver_id}>
        <label htmlFor={`draft-recipient-${pair.giver_id}`}>{data.participants.find(person => person.id === pair.giver_id)?.name} ({data.participants.find(person => person.id === pair.giver_id)?.email}) gives to</label>
        <select id={`draft-recipient-${pair.giver_id}`} value={pair.recipient_id} disabled={busy || data.drawConfirmed} onChange={e => setDraftPairs(current => current.map((item, i) => i === index ? { ...item, recipient_id: e.target.value } : item))}>
          {data.participants.filter(person => person.id !== pair.giver_id).map(person => <option key={person.id} value={person.id}>{person.name} ({person.email})</option>)}
        </select>
      </div>)}
      {!data.drawConfirmed && <>
        {draftError && <p className="error" role="status">{draftError}</p>}
        {draftDirty && <p className="notice">You have unsaved draft changes. Save them before confirming.</p>}
        <div className="actions">
          <button className="secondary" disabled={busy || !draftDirty || !!draftError} onClick={() => action("edit-draw", { pairs: draftPairs, revision: data.drawRevision })}>Save draft changes</button>
          <button className="secondary" disabled={busy || !draftDirty} onClick={() => setDraftPairs(savedPairs)}>Discard unsaved changes</button>
        </div>
      </>}
    </>}
    <h2>3. Confirm & send emails</h2>
    <p>Confirmation locks the assignments. Emails are then sent in batches automatically; keep this page open until sending finishes. You can retry any pending emails later.</p>
    <div className="actions">
      {!data.drawConfirmed && <button disabled={busy || !data.settings.assignments_generated || draftDirty || !!draftError} onClick={() => { if (confirm(`Confirm these assignments and send emails to ${data.participants.length} participants? Assignments cannot be changed after confirmation.`)) sendBlast(true); }}>Confirm draw & send all emails</button>}
      {data.drawConfirmed && <button disabled={busy || !pending} onClick={() => sendBlast(false)}>Send pending emails ({pending})</button>}
    </div>
    <p className="small">At least 3 participants are required. Nobody gives to themselves or forms a reciprocal pair. Retrying pending emails keeps the confirmed assignments.</p>
    {msg && <p role="status">{msg}</p>}
  </div>;
}
