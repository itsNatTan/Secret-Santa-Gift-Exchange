import {NextResponse} from "next/server";
import {db,getSettings,deadlinePassed,hashToken} from "@/lib/server";
export async function GET(req:Request){
 const token=new URL(req.url).searchParams.get("token")||"";
 if(!token)return NextResponse.json({error:"Missing edit token."},{status:400});
 const {data,error}=await db.from("participants").select("name,email,categories,wishlist_links,likes,dislikes").eq("edit_token_hash",hashToken(token)).maybeSingle();
 if(error||!data)return NextResponse.json({error:"Invalid edit link."},{status:404});
 return NextResponse.json({participant:data});
}
export async function PUT(req:Request){
 try{
  const b=await req.json(),s=await getSettings(),token=String(b.token||"");
  if(!s.registration_open||s.assignments_generated||deadlinePassed(s.registration_deadline))return NextResponse.json({error:"Registration is closed; edits are no longer allowed."},{status:403});
  if(!token)return NextResponse.json({error:"Invalid edit link."},{status:400});
  const patch={name:String(b.name||"").trim().slice(0,100),categories:Array.isArray(b.categories)?b.categories.slice(0,12):[],wishlist_links:Array.isArray(b.wishlist_links)?b.wishlist_links.slice(0,5):[],likes:String(b.likes||"").slice(0,1000),dislikes:String(b.dislikes||"").slice(0,1000),updated_at:new Date().toISOString()};
  if(!patch.name)return NextResponse.json({error:"Name is required."},{status:400});
  const {data,error}=await db.from("participants").update(patch).eq("edit_token_hash",hashToken(token)).select("id").maybeSingle();
  if(error||!data)return NextResponse.json({error:"Invalid edit link."},{status:404});
  return NextResponse.json({message:"Your details have been updated."});
 }catch(e:any){return NextResponse.json({error:e.message||"Unable to save changes."},{status:500});}
}
