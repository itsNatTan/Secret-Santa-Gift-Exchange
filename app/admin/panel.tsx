"use client";
import {useEffect,useState} from "react";
export default function AdminPanel(){
 const [data,setData]=useState<any>(null),[msg,setMsg]=useState("");
 async function load(){const r=await fetch("/api/admin/data");const d=await r.json();setData(d);if(!r.ok)setMsg(d.error||"Unable to load.");}
 useEffect(()=>{load()},[]);
 async function action(kind:string,body:any={}){setMsg("Working…");const r=await fetch("/api/admin/"+kind,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();setMsg(r.ok?(d.message||"Done."):(d.error||"Action failed."));await load();}
 if(!data)return <div className="card"><h1>Admin dashboard</h1><p>{msg||"Loading…"}</p></div>;
 return <div className="card">
  <div className="row"><h1>Gift Exchange Admin</h1><button className="secondary" onClick={()=>fetch("/api/admin/logout",{method:"POST"}).then(()=>location.reload())}>Log out</button></div>
  <p>{data.participants.length} registered participant(s)</p>
  <label>Gift budget</label><input id="budget" defaultValue={data.settings.gift_budget||""}/>
  <label>Gift exchange date</label><input id="date" defaultValue={data.settings.exchange_date||""} placeholder="e.g. 18 December 2026"/>
  <label>Registration deadline</label><input id="deadline" type="datetime-local" defaultValue={data.settings.registration_deadline?new Date(new Date(data.settings.registration_deadline).getTime()-new Date(data.settings.registration_deadline).getTimezoneOffset()*60000).toISOString().slice(0,16):""}/>
  <button className="secondary" onClick={()=>action("settings",{gift_budget:(document.getElementById("budget") as HTMLInputElement).value,exchange_date:(document.getElementById("date") as HTMLInputElement).value,registration_deadline:(document.getElementById("deadline") as HTMLInputElement).value})}>Save event settings</button>
  <p className="notice">Registration: {data.settings.registration_open?"Open":"Closed"} · Assignments: {data.settings.assignments_generated?"Generated":"Not generated"}</p>
  <h2>Participants</h2>
  {data.participants.map((p:any)=><div key={p.id} style={{borderTop:"1px solid #eee",padding:"10px 0"}}><strong>{p.name}</strong><div className="small">{p.email} · {p.categories.join(", ")}</div></div>)}
  <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:20}}>
   <button className="secondary" onClick={()=>action("close")}>Close registration</button>
   <button onClick={()=>{if(confirm("Generate and email all assignments? This cannot be undone."))action("draw")}} disabled={data.settings.assignments_generated||data.participants.length<3}>Generate & email assignments</button>
  </div>
  <p className="small">The draw requires at least 3 participants and prohibits both self-assignments and reciprocal pairs. The draw cannot be regenerated from this dashboard.</p>
  {msg&&<p>{msg}</p>}
 </div>;
}
