"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Exchange } from "@/lib/server";
type Participant = { id: string; name: string; email: string; categories: string[]; wishlist_links: string[]; likes: string; dislikes: string };
type Dashboard = { settings: Exchange; participants: Participant[]; deliveries: { giver_id: string; emailed_at: string | null }[] };
export default function AdminPanel() {
  const [data, setData] = useState<Dashboard | null>(null), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch("/api/admin/data"), d = await r.json();
    if (!r.ok) throw new Error(d.error || "Unable to load event.");
    setData(d);
  }
  useEffect(() => { load().catch(e => setMsg(e.message)); }, []);
  async function action(kind: string, body: Record<string, unknown> = {}) {
    setBusy(true); setMsg("Working…");
    try {
      const r = await fetch(`/api/admin/${kind}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), d = await r.json();
      setMsg(d.message || d.error || "Action failed."); await load();
    } catch { setMsg("Unable to complete the request. Refresh to check its status before trying again."); }
    finally { setBusy(false); }
  }
  if (!data) return <div className="card"><h1>Admin dashboard</h1><p role="status">{msg || "Loading…"}</p><Link href="/admin">Reload</Link></div>;
  const pending = data.deliveries.filter(d => !d.emailed_at).length;
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
    <p className="notice">Registration: {data.settings.registration_open ? "Open" : "Closed"} · Assignments: {data.settings.assignments_generated ? "Generated" : "Not generated"}</p>
    <h2>Participants</h2>
    {data.participants.map(p => <details key={p.id} className="participant"><summary><strong>{p.name}</strong> · {p.email}{data.settings.assignments_generated && <span className="small"> · {data.deliveries.find(d => d.giver_id === p.id)?.emailed_at ? "Email sent" : "Email pending"}</span>}</summary><p>Categories: {p.categories.join(", ") || "None"}<br/>Likes: {p.likes || "None"}<br/>Prefer not to receive: {p.dislikes || "None"}</p><ul>{p.wishlist_links.filter(u => /^https?:\/\//i.test(u)).map((u, i) => <li key={i}><a href={u} target="_blank" rel="noreferrer">{u}</a></li>)}</ul></details>)}
    <div className="actions">
      <button className="secondary" disabled={busy || !data.settings.registration_open} onClick={() => action("close")}>Close registration</button>
      <button disabled={busy || data.settings.assignments_generated || data.participants.length < 3} onClick={() => { if (confirm("Generate assignments and start sending emails? The draw cannot be undone.")) action("draw"); }}>Generate & email assignments</button>
      {data.settings.assignments_generated && <button disabled={busy || !pending} onClick={() => action("send-pending")}>Send pending emails ({pending})</button>}
    </div>
    <p className="small">At least 3 participants are required. Nobody draws themselves or forms a reciprocal pair. Emails are sent in batches of 5; continue sending until none are pending. Retrying keeps the same assignments.</p>
    {msg && <p role="status">{msg}</p>}
  </div>;
}
