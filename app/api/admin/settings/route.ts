import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {db,isAdminCookie} from "@/lib/server";
export async function POST(req:Request){
 const c=await cookies();if(!isAdminCookie(c.get("nscc_admin")?.value))return NextResponse.json({error:"Not authorised."},{status:401});
 const b=await req.json();const deadline=b.registration_deadline?new Date(b.registration_deadline).toISOString():null;
 const {error}=await db.from("event_settings").update({gift_budget:String(b.gift_budget||"").slice(0,100),exchange_date:String(b.exchange_date||"").slice(0,100),registration_deadline:deadline,updated_at:new Date().toISOString()}).eq("id",1);
 return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({message:"Event settings saved."});
}
