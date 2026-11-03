import Link from "next/link";
import { currentAdminEvent } from "@/lib/server";
import AdminPanel from "./panel";
export const dynamic = "force-dynamic";
export default async function Admin({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentAdminEvent()) return <main><AdminPanel /></main>;
  const { error } = await searchParams;
  return <main><Link href="/">← Home</Link><div className="card"><h1>Gift Exchange Admin</h1><p>Use the event code and private admin code you saved when creating your exchange. No account needed.</p><form action="/api/admin/login" method="POST"><label htmlFor="event-code">Event code</label><input id="event-code" name="event_code" required maxLength={40}/><label htmlFor="admin-code">Private admin code</label><input id="admin-code" name="admin_code" type="password" required autoComplete="current-password"/><button>Open dashboard</button>{error && <p className="error" role="alert">Unable to sign in. Check both codes and try again.</p>}</form></div></main>;
}
