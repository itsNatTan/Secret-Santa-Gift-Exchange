import {NextResponse} from "next/server";
import {adminCookieValue} from "@/lib/server";
import {timingSafeEqual} from "crypto";
export async function POST(req:Request){
 const f=await req.formData(),p=String(f.get("password")||""),expected=process.env.ADMIN_PASSWORD||"";
 const a=Buffer.from(p),b=Buffer.from(expected);
 if(!expected||a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.redirect(new URL("/admin?error=1",req.url));
 const r=NextResponse.redirect(new URL("/admin",req.url));
 r.cookies.set("nscc_admin",adminCookieValue(),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:60*60*8});
 return r;
}
