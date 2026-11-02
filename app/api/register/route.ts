import { NextResponse } from "next/server";
import { db, getSettings, deadlinePassed, newToken, hashToken, sendEmail } from "@/lib/server";
export async function POST(req:Request) {
 try {
  const s=await getSettings();
  if(!s.registration_open || s.assignments_generated || deadlinePassed(s.registration_deadline)) return NextResponse.json({error:"Registration is closed."},{status:403});
  const b=await req.json(); const name=String(b.name||"").trim(), email=String(b.email||"").trim().toLowerCase();
  if (!name || name.length > 100 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({error:"Please provide a valid name and email."},{status:400});
  const cats=Array.isArray(b.categories)?b.categories.slice(0,12).map(String):[];
  const links: string[] = Array.isArray(b.wishlist_links)
  ? b.wishlist_links
      .slice(0, 5)
      .map(String)
      .filter((x: string) => /^https?:\/\//i.test(x))
  : [];
  const token=newToken();
  const record={name,email,categories:cats,wishlist_links:links,likes:String(b.likes||"").slice(0,1000),dislikes:String(b.dislikes||"").slice(0,1000),edit_token_hash:hashToken(token),updated_at:new Date().toISOString()};
  const {error}=await db.from("participants").insert(record);
  if(error?.code === "23505") return NextResponse.json({error:"This email address is already registered. Please use your existing edit link or contact the organiser."},{status:409});
  if(error) throw error;
  const url=`${process.env.NEXT_PUBLIC_SITE_URL}/edit?token=${token}`;
  await sendEmail(email,"Your NSCC Gift Exchange registration",`<p>Hi ${escapeHtml(name)},</p><p>You're registered for the NSCC Gift Exchange!</p><p>You can update your details before registration closes using this private link:</p><p><a href="${url}">Edit my registration</a></p><p>Please keep this link private.</p>`);
  return NextResponse.json({message:"You're registered! Check your email for your private edit link."});
 } catch(e:any){return NextResponse.json({error:e.message||"Registration failed."},{status:500});}
}
function escapeHtml(s:string){return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));}
