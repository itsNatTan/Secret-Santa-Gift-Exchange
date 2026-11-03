import Link from "next/link";
import EventForms from "./event-forms";
export default function Home() {
  return <main>
    <div className="card"><p className="small">A LITTLE FESTIVE JOY</p><h1>🎁 Gift Exchange</h1><p>Bring your group together for Secret Santa. Create an exchange, invite your friends, and let the draw find everyone a recipient.</p><p>No account needed. Each event has its own join code and a private organiser code.</p></div>
    <EventForms />
    <p className="small">Organising an existing exchange? <Link href="/admin">Open the admin dashboard</Link></p>
  </main>;
}
