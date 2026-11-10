import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as roster from "../lib/roster-import.ts";
import { newToken, hashToken } from "../lib/security.ts";
import { siteUrl } from "../lib/site-url.ts";

test("Excel roster accepts headers, either column order, blank rows, quoted cells and CSV", () => {
  assert.deepEqual(roster.parseRoster("\uFEFFEmail\tFull Name\tTeam\r\n ALEX@EXAMPLE.COM \tAlex Tan\tA\r\n\r\n"), [
    { row: 2, name: "Alex Tan", email: "alex@example.com" }
  ]);
  assert.deepEqual(roster.parseRoster('"Alex ""Ace"" Tan"\talex@example.com\n"Jamie\nLee"\tjamie@example.com'), [
    { row: 1, name: 'Alex "Ace" Tan', email: "alex@example.com" },
    { row: 2, name: "Jamie\nLee", email: "jamie@example.com" }
  ]);
  assert.deepEqual(roster.parseRoster('Name,Email\n"Tan, Alex",alex@example.com'), [
    { row: 2, name: "Tan, Alex", email: "alex@example.com" }
  ]);
  assert.deepEqual(roster.parseRoster("\n\t\n"), []);
});

test("roster flags invalid and duplicate rows without silently losing valid people", () => {
  const rows = roster.parseRoster("Name\tEmail\nAlex\talex@example.com\nDifferent name\tALEX@EXAMPLE.COM\nNo email\tbad\n\tblank@example.com\nJamie\tjamie@example.com\textra");
  assert.equal(rows[1].duplicate, true);
  assert.match(rows[2].error!, /valid email/);
  assert.match(rows[3].error!, /Name/);
  assert.equal(rows[4].error, undefined); // Extra columns are allowed with headers.
  assert.match(roster.parseRoster("Jamie\tjamie@example.com\textra")[0].error!, /two columns/);
  assert.throws(() => roster.parseRoster('"Unfinished\talex@example.com'), /unfinished/);
  assert.throws(() => roster.parseRoster('"Alex"junk\talex@example.com'), /quotes/);
  assert.throws(() => roster.parseRoster("x".repeat(200001)), /200,000/);
  assert.throws(() => roster.parseRoster(Array.from({ length: 1001 }, (_, i) => `Person ${i}\tperson${i}@example.com`).join("\n")), /1,000/);
});

type Stored = { event_id: string; name: string; email: string; categories: string[]; likes: string; dislikes: string; edit_token_hash: string };
function setup(options: { unauthorised?: boolean; closed?: boolean; expired?: boolean; drawn?: boolean; smtpFails?: boolean; insertError?: { code?: string; message: string } } = {}) {
  const stored: Stored[] = [], messages: { to: string; subject: string; html: string }[] = [];
  let lookedUpEvent = "", insertCalls = 0;
  const query = {
    select() { return query; },
    async eq(_field: string, value: string) { lookedUpEvent = value; return { data: stored.filter(person => person.event_id === value), error: null }; },
    async insert(person: Stored) {
      insertCalls++;
      if (options.insertError) return { error: options.insertError };
      if (stored.some(existing => existing.event_id === person.event_id && existing.email === person.email)) return { error: { code: "23505", message: "duplicate" } };
      stored.push(person); return { error: null };
    }
  };
  const server = {
    currentAdminEvent: async () => options.unauthorised ? null : "event-a",
    database: () => ({ from: () => query }),
    getSettings: async () => ({ name: "Gift <Exchange>", registration_open: !options.closed, assignments_generated: !!options.drawn, registration_deadline: options.expired ? "2000-01-01" : null }),
    deadlinePassed: (value: string | null) => !!value && Date.now() >= new Date(value).getTime(),
    newToken, hashToken, siteUrl: (url: string) => siteUrl(url, ""),
    escapeHtml: (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    sendEmail: async (to: string, subject: string, html: string) => {
      messages.push({ to, subject, html });
      if (options.smtpFails) throw new Error("SMTP unavailable");
    }
  };
  const exports: { POST?: (req: Request) => Promise<Response> } = {};
  const source = ts.transpileModule(readFileSync(new URL("../app/api/admin/import-participants/route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  runInNewContext(source, { exports, console: { error() {} }, require: (id: string) => {
    if (id === "@/lib/server") return server;
    if (id === "@/lib/roster-import") return roster;
    if (id === "next/server") return { NextResponse: { json: Response.json } };
    throw new Error(`Unexpected import: ${id}`);
  } });
  return {
    post: (participants: unknown = [{ name: "Alex <Guest>", email: "ALEX@EXAMPLE.COM" }]) => exports.POST!(new Request("https://exchange.example/api/admin/import-participants", { method: "POST", body: JSON.stringify({ participants }) })),
    stored, messages, get insertCalls() { return insertCalls; }, get lookedUpEvent() { return lookedUpEvent; }
  };
}

test("admin import validates the entire batch before inserts and requires open registration", async () => {
  const unauthorised = setup({ unauthorised: true });
  assert.equal((await unauthorised.post()).status, 401);
  assert.equal(unauthorised.insertCalls, 0);
  for (const options of [{ closed: true }, { expired: true }, { drawn: true }]) {
    const route = setup(options);
    assert.equal((await route.post()).status, 403);
    assert.equal(route.insertCalls, 0);
    assert.equal(route.messages.length, 0);
  }
  for (const batch of [null, [], Array(6).fill({ name: "Alex", email: "alex@example.com" }), [{ name: "Alex", email: "bad" }], [{ name: "Alex", email: "alex@example.com" }, { name: "Bad", email: "bad" }], [{ name: "Alex", email: "alex@example.com" }, { name: "Other", email: "ALEX@EXAMPLE.COM" }]]) {
    const route = setup();
    assert.equal((await route.post(batch)).status, 400);
    assert.equal(route.insertCalls, 0);
  }
});

test("import saves blank preferences for the admin event and emails the matching private edit link", async () => {
  const route = setup(), response = await route.post(), result = (await response.json()).results[0];
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(result.status, "registered");
  assert.equal(result.emailSent, true);
  assert.equal(route.lookedUpEvent, "event-a");
  const saved = route.stored[0], message = route.messages[0];
  assert.equal(saved.event_id, "event-a");
  assert.equal(saved.email, "alex@example.com");
  assert.equal(saved.likes, ""); assert.equal(saved.dislikes, "");
  assert.equal(saved.categories.length, 0);
  assert.equal(message.to, saved.email);
  assert.match(message.html, /Alex &lt;Guest&gt;/);
  assert.match(message.html, /Gift &lt;Exchange&gt;/);
  const link = message.html.match(/href="([^"]+)"/)![1];
  assert.equal(new URL(link).origin, "https://exchange.example");
  assert.equal(hashToken(new URL(link).searchParams.get("token")!), saved.edit_token_hash);
  assert.equal(result.editUrl, undefined);
});

test("repeated and overlapping imports preserve existing people and send no duplicate email", async () => {
  const route = setup();
  await route.post();
  route.stored[0].likes = "Coffee";
  const originalToken = route.stored[0].edit_token_hash;
  const retry = (await (await route.post([{ name: "Different name", email: "alex@example.com" }])).json()).results[0];
  assert.equal(retry.status, "existing");
  assert.equal(route.stored[0].name, "Alex <Guest>");
  assert.equal(route.stored[0].likes, "Coffee");
  assert.equal(route.stored[0].edit_token_hash, originalToken);
  assert.equal(route.messages.length, 1);
  route.stored[0].email = "ALEX@EXAMPLE.COM";
  assert.equal((await (await route.post()).json()).results[0].status, "existing");
  const race = setup({ insertError: { code: "23505", message: "duplicate" } });
  assert.equal((await (await race.post()).json()).results[0].status, "existing");
  assert.equal(race.messages.length, 0);
  // The same address in another event does not block this event's import.
  const otherEvent = setup();
  otherEvent.stored.push({ ...route.stored[0], event_id: "event-b", email: "alex@example.com" });
  assert.equal((await (await otherEvent.post()).json()).results[0].status, "registered");
  assert.equal(otherEvent.stored.length, 2);
});

test("SMTP failure preserves registration and returns its edit link; failed inserts never email", async () => {
  const route = setup({ smtpFails: true }), result = (await (await route.post()).json()).results[0];
  assert.equal(result.status, "registered");
  assert.equal(result.emailSent, false);
  assert.equal(route.stored.length, 1);
  assert.equal(hashToken(new URL(result.editUrl).searchParams.get("token")!), route.stored[0].edit_token_hash);
  for (const message of ["Registration is closed", "Database unavailable"]) {
    const failure = setup({ insertError: { message } });
    const failed = (await (await failure.post()).json()).results[0];
    assert.equal(failed.status, "failed");
    assert.equal(failure.messages.length, 0);
    assert.equal(failed.editUrl, undefined);
  }
});
