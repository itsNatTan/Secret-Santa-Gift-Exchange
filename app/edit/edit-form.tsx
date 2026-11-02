"use client";
import {useEffect,useState} from "react";
const categories=["Food & snacks","Technology & gadgets","Lifestyle & everyday items","Books & stationery","Home & decor","Fashion & accessories","Games & entertainment","Experiences","Surprise me!"];
export default function EditForm({token}:{token:string}) {
 const [data,setData]=useState<any>(null),[msg,setMsg]=useState("Loading…"),[busy,setBusy]=useState(false);
 useEffect(()=>{fetch("/api/participant?token="+encodeURIComponent(token)).then(r=>r.json()).then(d=>{if(d.participant){setData(d.participant);setMsg("")}else setMsg(d.error||"Invalid edit link.")}).catch(()=>setMsg("Unable to load registration."))},[token]);
 async function save(e:React.FormEvent){e.preventDefault();setBusy(true);const r=await fetch("/api/participant",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({token,...data})});const d=await r.json();setBusy(false);setMsg(r.ok?d.message:d.error||"Unable to save.");}
 if(!data)return <p>{msg}</p>;
 return <form onSubmit={save}>
  <label>Name</label><input value={data.name} onChange={e=>setData({...data,name:e.target.value})} required/>
  <label>Email</label><input value={data.email} disabled/>
  <label>Gift categories</label><div className="checks">{categories.map(c=><label key={c}><input type="checkbox" checked={data.categories.includes(c)} onChange={e=>setData({...data,categories:e.target.checked?[...data.categories,c]:data.categories.filter((x:string)=>x!==c)})}/>{c}</label>)}</div>
  <label>Wishlist links (one per line, up to 5)</label><textarea value={data.wishlist_links.join("\n")} onChange={e=>setData({...data,wishlist_links:e.target.value.split("\n").filter(Boolean).slice(0,5)})}/>
  <label>Things you like</label><textarea value={data.likes} onChange={e=>setData({...data,likes:e.target.value})}/>
  <label>Anything you'd prefer not to receive?</label><textarea value={data.dislikes} onChange={e=>setData({...data,dislikes:e.target.value})}/>
  <button disabled={busy}>{busy?"Saving…":"Save changes"}</button><p>{msg}</p>
 </form>;
}
