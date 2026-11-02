import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {db,isAdminCookie,getSettings,sendEmail} from "@/lib/server";
import {makeSecretSanta} from "@/lib/matching";
export async function POST(){
 const c=await cookies();if(!isAdminCookie(c.get("nscc_admin")?.value))return NextResponse.json({error:"Not authorised."},{status:401});
 try{
  const s=await getSettings();
  if(s.assignments_generated)return NextResponse.json({error:"Assignments have already been generated."},{status:409});
  const {data:people,error}=await db.from("participants").select("*");
  if(error)throw error;
  if(!people||people.length<3)return NextResponse.json({error:"At least 3 participants are required."},{status:400});
  const assignments=makeSecretSanta(people.map(p=>p.id));
  const {error:delError}=await db.from("assignments").delete().neq("id","00000000-0000-0000-0000-000000000000");
  if(delError)throw delError;
  const {error:insertError}=await db.from("assignments").insert(assignments);
  if(insertError)throw insertError;
  // Mark as generated before sending mail to prevent a second draw if an email fails.
  const {error:settingsError}=await db.from("event_settings").update({assignments_generated:true,registration_open:false,updated_at:new Date().toISOString()}).eq("id",1);
  if(settingsError)throw settingsError;
  const byId=new Map(people.map(p=>[p.id,p]));
  const outcomes=await Promise.allSettled(assignments.map(async a=>{
   const giver=byId.get(a.giver_id)!,recipient=byId.get(a.recipient_id)!;
   const wishlist=(recipient.wishlist_links||[]).map((u:string)=>`<li><a href="${escapeAttr(u)}">${escapeHtml(u)}</a></li>`).join("");
   const html=`<p>Hi ${escapeHtml(giver.name)},</p><p>Your NSCC Gift Exchange recipient is:</p><h2>${escapeHtml(recipient.name)}</h2><p><strong>Gift categories:</strong> ${escapeHtml((recipient.categories||[]).join(", ")||"No preference provided")}</p><p><strong>Things they like:</strong> ${escapeHtml(recipient.likes||"Not specified")}</p><p><strong>Prefer not to receive:</strong> ${escapeHtml(recipient.dislikes||"Not specified")}</p><p><strong>Wishlist:</strong></p><ul>${wishlist||"<li>No links provided</li>"}</ul><p>Suggested budget: ${escapeHtml(s.gift_budget||"To be confirmed")}<br/>Exchange date: ${escapeHtml(s.exchange_date||"To be confirmed")}</p><p>Please keep your assignment secret. Happy gifting!</p>`;
   await sendEmail(giver.email,"Your NSCC Gift Exchange assignment",html);
  }));
  const failed=outcomes.filter(x=>x.status==="rejected").length;
  return NextResponse.json({message:failed?`Draw completed, but ${failed} assignment email(s) failed. Do not redraw; check Resend logs and send those emails manually.`:"Assignments generated and all emails sent!"});
 }catch(e:any){return NextResponse.json({error:e.message||"Draw failed."},{status:500});}
}
function escapeHtml(s:string){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
function escapeAttr(s:string){return /^https?:\\/\\//i.test(s)?s:"#";}
