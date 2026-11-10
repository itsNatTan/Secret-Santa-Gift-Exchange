export type RosterPerson = { name: string; email: string };
export type RosterRow = RosterPerson & { row: number; error?: string; duplicate?: boolean };
export type ImportResult = RosterPerson & { status: "registered" | "existing" | "failed"; emailSent?: boolean; editUrl?: string; error?: string };
export const IMPORT_BATCH_SIZE = 5;

export function rosterPerson(value: unknown): RosterPerson {
  if (!value || typeof value !== "object") throw new Error("Provide a name and email address.");
  const person = value as Record<string, unknown>;
  if (typeof person.name !== "string" || typeof person.email !== "string") throw new Error("Provide a name and email address.");
  const name = person.name.trim(), email = person.email.trim().toLowerCase();
  if (!name || name.length > 100) throw new Error("Name must contain 1–100 characters.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Provide a valid email address.");
  return { name, email };
}

// Excel clipboard data is TSV, including quoted cells and embedded newlines.
// Also accept CSV so a two-column list can be pasted from a text editor.
export function parseRoster(text: string): RosterRow[] {
  if (text.length > 200_000) throw new Error("Paste no more than 200,000 characters at a time.");
  text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const delimiter = text.includes("\t") ? "\t" : ",";
  const records: string[][] = [];
  let fields: string[] = [], field = "", quoted = false, closedQuote = false;
  function finishField() { fields.push(field); field = ""; closedQuote = false; }
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closedQuote = true; }
      else field += char;
    } else if (char === delimiter) finishField();
    else if (char === "\n") { finishField(); records.push(fields); fields = []; }
    else if (char === '"' && field === "" && !closedQuote) quoted = true;
    else if (closedQuote && !/\s/.test(char)) throw new Error("Check the quotes around pasted cells.");
    else if (!closedQuote) field += char;
  }
  if (quoted) throw new Error("A quoted cell is unfinished. Copy both columns from Excel again.");
  finishField(); records.push(fields);
  const first = records.findIndex(record => record.some(cell => cell.trim()));
  if (first < 0) return [];
  const header = records[first].map(cell => cell.trim().toLowerCase());
  const nameColumn = header.findIndex(cell => ["name", "full name", "participant name"].includes(cell));
  const emailColumn = header.findIndex(cell => ["email", "email address", "e-mail", "e-mail address"].includes(cell));
  const hasHeader = nameColumn >= 0 && emailColumn >= 0;
  const seen = new Set<string>();
  const rows = records.flatMap((record, index): RosterRow[] => {
    if (!record.some(cell => cell.trim()) || (hasHeader && index === first)) return [];
    const person = { name: record[hasHeader ? nameColumn : 0]?.trim() || "", email: (record[hasHeader ? emailColumn : 1] || "").trim().toLowerCase() };
    const row = { ...person, row: index + 1 };
    if (!hasHeader && record.length !== 2) return [{ ...row, error: "Use two columns: name, then email (or include Name and Email headers)." }];
    try {
      rosterPerson(person);
      if (seen.has(person.email)) return [{ ...row, duplicate: true }];
      seen.add(person.email);
      return [row];
    } catch (error) { return [{ ...row, error: error instanceof Error ? error.message : "Invalid name or email." }]; }
  });
  if (rows.length > 1000) throw new Error("Paste no more than 1,000 people at a time.");
  return rows;
}
