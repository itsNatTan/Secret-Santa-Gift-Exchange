import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {db,isAdminCookie,getSettings} from "@/lib/server";
export async function GET(){
 const c=await cookies();if(!isAdminCookie(c.get("nscc_admin")?.value))return NextResponse.json({error:"Not authorised."},{status:401});
 const [{data,error},settings]=await Promise.all([db.from("participants").select("id,name,email,categories,created_at").order("created_at"),getSettings()]);
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({participants:data,settings});
}
