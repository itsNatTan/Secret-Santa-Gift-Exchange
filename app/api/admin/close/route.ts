import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {db,isAdminCookie} from "@/lib/server";
export async function POST(){
 const c=await cookies();if(!isAdminCookie(c.get("nscc_admin")?.value))return NextResponse.json({error:"Not authorised."},{status:401});
 const {error}=await db.from("event_settings").update({registration_open:false,updated_at:new Date().toISOString()}).eq("id",1);
 return error?NextResponse.json({error:error.message},{status:500}):NextResponse.json({message:"Registration is now closed."});
}
