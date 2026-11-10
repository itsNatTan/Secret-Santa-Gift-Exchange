"use client";
import { useState } from "react";
import { IMPORT_BATCH_SIZE, parseRoster, type ImportResult, type RosterPerson, type RosterRow } from "@/lib/roster-import";

export default function RosterImport({ participants, available, busy, onBusyChange, onImported }: {
  participants: RosterPerson[]; available: boolean; busy: boolean;
  onBusyChange: (busy: boolean) => void; onImported: () => Promise<unknown>;
}) {
  const [text, setText] = useState(""), [message, setMessage] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]);
  let rows: RosterRow[] = [], parseError = "";
  try { rows = parseRoster(text); }
  catch (error) { parseError = error instanceof Error ? error.message : "Check the pasted list."; }
  const existing = new Map(participants.map(person => [person.email.trim().toLowerCase(), person]));
  const missing = rows.filter(row => !row.error && !row.duplicate && !existing.has(row.email));
  const invalid = rows.filter(row => row.error).length;
  const duplicates = rows.filter(row => row.duplicate).length;
  const registered = rows.filter(row => !row.error && !row.duplicate && existing.has(row.email)).length;

  async function importMissing() {
    onBusyChange(true); setResults([]); setMessage("Importing missing participants and sending registration emails… Keep this page open.");
    const outcomes: ImportResult[] = [];
    try {
      for (let offset = 0; offset < missing.length; offset += IMPORT_BATCH_SIZE) {
        const response = await fetch("/api/admin/import-participants", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ participants: missing.slice(offset, offset + IMPORT_BATCH_SIZE).map(({ name, email }) => ({ name, email })) })
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Import stopped. Refresh the participant list before retrying.");
        outcomes.push(...body.results); setResults([...outcomes]);
        setMessage(`Processed ${Math.min(offset + IMPORT_BATCH_SIZE, missing.length)} of ${missing.length} people… Keep this page open.`);
        if (body.results.some((result: ImportResult) => result.status === "failed")) {
          throw new Error("Import stopped because some registrations failed. Review the results and retry after resolving the issue.");
        }
      }
      const added = outcomes.filter(result => result.status === "registered").length;
      const emailed = outcomes.filter(result => result.status === "registered" && result.emailSent).length;
      const skipped = outcomes.filter(result => result.status === "existing").length;
      setMessage(`${added} registered; ${emailed} registration email(s) sent; ${added - emailed} email(s) failed; ${skipped} already registered and skipped.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import was interrupted. Refresh the participant list before retrying.");
    } finally {
      try { await onImported(); }
      catch { setMessage(current => `${current} Could not refresh the participant list. Reload the dashboard before retrying.`); }
      onBusyChange(false);
    }
  }

  return <section className="roster-import">
    <h2>Import expected participants</h2>
    <p>Copy the name and email columns from Excel and paste below. Use name then email, or include Name and Email headers in either order. Matches use the email address; existing registrations and preferences are kept as-is.</p>
    <label htmlFor="roster-paste">Names and email addresses</label>
    <textarea id="roster-paste" rows={6} maxLength={200_000} value={text} disabled={busy} placeholder={"Name\tEmail\nAlex Tan\talex@example.com\nJamie Lee\tjamie@example.com"} onChange={event => { setText(event.target.value); setMessage(""); }}/>
    {!available && <p className="notice">Import is available while registration is open, before the deadline and before generating a draw. Save any unsaved forced pairings first.</p>}
    {parseError && <p className="error" role="status">{parseError}</p>}
    {!!rows.length && <>
      <p role="status">{missing.length} missing · {registered} already registered · {duplicates} duplicate row(s) · {invalid} invalid row(s)</p>
      <div className="table-scroll"><table className="roster-table">
        <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Status</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.row}>
          <td>{row.row}</td><td>{row.name || "—"}</td><td>{row.email || "—"}</td>
          <td>{row.error || (row.duplicate ? "Duplicate in pasted list — skipped" : existing.has(row.email) ? `Already registered as ${existing.get(row.email)!.name} — skipped` : "Missing — will be registered")}</td>
        </tr>)}</tbody>
      </table></div>
    </>}
    <p className="small">New participants start with no categories, likes or dislikes. Each receives a private edit link to add preferences. Keep this page open during import.</p>
    {invalid > 0 && <p className="error">Correct the invalid rows before importing.</p>}
    <button disabled={busy || !available || !!parseError || invalid > 0 || !missing.length} onClick={importMissing}>Import missing participants & email ({missing.length})</button>
    {message && <p role="status">{message}</p>}
    {!!results.length && <details open={results.some(result => result.status === "failed" || result.emailSent === false)}>
      <summary>Import results ({results.length})</summary>
      {results.map(result => <div className="participant" key={result.email}>
        <p><strong>{result.name}</strong> · {result.email}<br/>
          {result.status === "existing" ? "Already registered — skipped, no email sent." : result.status === "failed" ? result.error : result.emailSent ? "Registered — registration email sent." : "Registered — email failed. Copy the private edit link below, or use Generate new edit link & email to retry."}
        </p>
        {result.editUrl && <>
          <label htmlFor={`import-link-${result.email}`}>Private edit link for {result.name}</label>
          <input id={`import-link-${result.email}`} value={result.editUrl} readOnly onFocus={event => event.target.select()}/>
          <button className="secondary" disabled={busy} onClick={async () => {
            try { await navigator.clipboard.writeText(result.editUrl!); setMessage("Edit link copied. Send it privately to the participant."); }
            catch { setMessage("Select the edit link above and copy it manually."); }
          }}>Copy edit link</button>
          <p className="small">Save this link before leaving the dashboard; it is only shown for this session.</p>
        </>}
      </div>)}
    </details>}
  </section>;
}
