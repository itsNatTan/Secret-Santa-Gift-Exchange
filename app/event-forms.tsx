"use client";
import { useState } from "react";
import Link from "next/link";
export default function EventForms() {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [created, setCreated] = useState<{ event: { name: string; join_code: string }; adminCode: string } | null>(null);
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError("");
    const name = new FormData(e.currentTarget).get("name");
    try {
      const r = await fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Unable to create event.");
      setCreated(d);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to create event."); }
    finally { setBusy(false); }
  }
  function downloadCodes() {
    if (!created) return;
    const text = `Event: ${created.event.name}\nJoin code: ${created.event.join_code}\nJoin URL: ${location.origin}/events/${created.event.join_code}\nAdmin page: ${location.origin}/admin\nPrivate admin code: ${created.adminCode}\nKeep the admin code private. Anyone with it can manage this event.\n`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = "gift-exchange-codes.txt"; a.click(); URL.revokeObjectURL(url);
  }
  return <>
    <form className="card" onSubmit={e => { e.preventDefault(); const code = String(new FormData(e.currentTarget).get("code") || "").trim().replace(/[\s-]/g, "").toUpperCase(); if (code) location.assign(`/events/${encodeURIComponent(code)}`); }}>
      <h2>Join an exchange</h2><label htmlFor="join-code">Event code</label><input id="join-code" name="code" required maxLength={40} placeholder="Enter the code from your organiser" autoComplete="off"/><button>Find event</button>
    </form>
    {created ? <section className="card"><h2>{created.event.name} is ready</h2>
      <p>Share this join code: <strong>{created.event.join_code}</strong></p>
      <p><Link href={`/events/${created.event.join_code}`}>Open the event join page</Link></p>
      <label htmlFor="share-url">Shareable join URL</label><input id="share-url" readOnly value={`${typeof window !== "undefined" ? window.location.origin : ""}/events/${created.event.join_code}`} onFocus={e => e.target.select()}/>
      <div className="notice"><strong>Save your private admin code now</strong><p>This code is shown only once. Keep it safe; anyone with it can manage your exchange.</p><code className="secret">{created.adminCode}</code></div>
      <p><button className="secondary" onClick={downloadCodes}>Download my codes</button></p>
      <Link className="button" href="/admin">Open admin dashboard</Link>
    </section> : <form className="card" onSubmit={create}><h2>Create an exchange</h2><label htmlFor="event-name">Event name</label><input id="event-name" name="name" required maxLength={100} placeholder="e.g. NSCC Christmas 2026"/><p className="small">You'll receive a join code for participants and a private admin code to keep.</p><button disabled={busy}>{busy ? "Creating…" : "Create event"}</button>{error && <p role="alert" className="error">{error}</p>}</form>}
  </>;
}
