"use client";
import { useState } from "react";
const categories = ["Food & snacks","Technology & gadgets","Lifestyle & everyday items","Books & stationery","Home & decor","Fashion & accessories","Games & entertainment","Experiences","Surprise me!"];
export default function SignupForm({ eventId }: { eventId: string }) {
  const [busy,setBusy] = useState(false), [message,setMessage] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [failed, setFailed] = useState(false);
  const [cats,setCats] = useState<string[]>([]);
  const [links,setLinks] = useState(["","",""]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage("");
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const payload = { event_id: eventId, name:f.get("name"), email:f.get("email"), categories:cats, wishlist_links:links.filter(x=>x.trim()), likes:f.get("likes"), dislikes:f.get("dislikes") };
      const res = await fetch("/api/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data = await res.json(); setFailed(!res.ok);
      setMessage(res.ok ? data.message : (data.error || "Something went wrong."));
      if(res.ok) { setEditUrl(data.editUrl); form.reset(); setCats([]); setLinks(["", "", ""]); }
    } catch { setFailed(true); setMessage("Unable to submit. Check your connection and try again."); }
    finally { setBusy(false); }
  }
  if (editUrl) return <div className="card"><h2>You're registered</h2><p className="success" role="status">{message}</p><p><a href={editUrl}>Edit my registration</a></p><label htmlFor="edit-url">Save this private link</label><input id="edit-url" value={editUrl} readOnly onFocus={e => e.target.select()}/></div>;
  return <form className="card" onSubmit={submit}>
    <h2>Sign up</h2>
    <p className="small">Enter your details and a few ideas to help your Secret Santa choose something you'll enjoy.</p>
    <label>Your name *</label><input name="name" required maxLength={100} placeholder="e.g. Alex Tan"/>
    <label>Email address *</label><input name="email" type="email" required maxLength={254} placeholder="Where should we send your assignment?"/>
    <label>Gift categories</label>
    <div className="checks">{categories.map(c=><label key={c}><input type="checkbox" checked={cats.includes(c)} onChange={e=>setCats(old=>e.target.checked?[...old,c]:old.filter(x=>x!==c))}/>{c}</label>)}</div>
    <label>Wishlist links <span className="small">(optional, up to 5)</span></label>
    {links.map((v,i)=><input key={i} style={{marginBottom:8}} type="url" value={v} onChange={e=>setLinks(old=>old.map((x,j)=>j===i?e.target.value:x))} placeholder={`Item ${i+1} URL (https://...)`}/>)}
    {links.length<5 && <button type="button" className="secondary" onClick={()=>setLinks(old=>[...old,""])}>+ Add another link</button>}
    <label>Things you like</label><textarea name="likes" maxLength={1000} placeholder="e.g. coffee, plants, board games, stationery..."/>
    <label>Anything you'd prefer not to receive?</label><textarea name="dislikes" maxLength={1000} placeholder="Optional"/>
    <p className="small">You can update your details using the private edit link sent to your email, until registration closes.</p>
    <button disabled={busy} type="submit">{busy?"Submitting…":"Join the gift exchange"}</button>
    {message && <p role="status" className={failed?"error":"success"}>{message}</p>}
  </form>;
}
