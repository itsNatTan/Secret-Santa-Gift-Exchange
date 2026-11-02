import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {isAdminCookie} from "@/lib/server";
import AdminPanel from "./panel";
export const dynamic="force-dynamic";
export default async function Admin(){
 const c=await cookies();
 if(!isAdminCookie(c.get("nscc_admin")?.value))return <main><div className="card"><h1>NSCC Gift Exchange Admin</h1><form action="/api/admin/login" method="post"><label>Admin password</label><input name="password" type="password" required/><button>Log in</button></form></div></main>;
 return <main><AdminPanel/></main>;
}
