import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { hashToken, newToken } from "../lib/security.ts";
import { siteUrl } from "../lib/site-url.ts";

// Exercise the route with isolated database/SMTP adapters, without real emails.
const source = ts.transpileModule(readFileSync(new URL("../app/api/admin/replace-edit-link/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
}).outputText;
const participantId = "11111111-1111-4111-8111-111111111111";
function setup(options: { authorised?: boolean; closed?: boolean; drawn?: boolean; expired?: boolean; missing?: boolean; smtpFails?: boolean; databaseError?: string } = {}) {
  const filters: Record<string, string> = {};
  let patch: Record<string, string> | undefined;
  const messages: { to: string; subject: string; html: string }[] = [];
  let databaseCalls = 0;
  const query = {
    update(value: Record<string, string>) { patch = value; return query; },
    eq(key: string, value: string) { filters[key] = value; return query; },
    select() { return query; },
    async maybeSingle() {
      return { data: options.missing ? null : { name: "Alex <Guest>", email: "alex@example.com" }, error: options.databaseError ? { message: options.databaseError } : null };
    }
  };
  const server = {
    currentAdminEvent: async () => options.authorised === false ? null : "event-a",
    database: () => { databaseCalls++; return { from: () => query }; },
    getSettings: async () => ({ name: "Gift <Exchange>", registration_open: !options.closed, assignments_generated: !!options.drawn, registration_deadline: options.expired ? "2000-01-01T00:00:00Z" : null }),
    deadlinePassed: (value: string | null) => !!value && Date.now() >= new Date(value).getTime(),
    newToken, hashToken, siteUrl: (url: string) => siteUrl(url, ""),
    escapeHtml: (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    sendEmail: async (to: string, subject: string, html: string) => {
      messages.push({ to, subject, html });
      if (options.smtpFails) throw new Error("SMTP unavailable");
    }
  };
  const exports: { POST?: (req: Request) => Promise<Response> } = {};
  runInNewContext(source, {
    exports, console: { error() {} },
    require: (id: string) => {
      if (id === "@/lib/server") return server;
      if (id === "next/server") return { NextResponse: { json: Response.json } };
      throw new Error(`Unexpected import: ${id}`);
    }
  });
  return {
    post: (body: unknown = { participant_id: participantId }) => exports.POST!(new Request("https://exchange.example/api/admin/replace-edit-link", { method: "POST", body: JSON.stringify(body) })),
    filters, messages, get patch() { return patch; }, get databaseCalls() { return databaseCalls; }
  };
}

test("replacement links require an admin and valid participant ID", async () => {
  const unauthorised = setup({ authorised: false });
  assert.equal((await unauthorised.post()).status, 401);
  assert.equal(unauthorised.databaseCalls, 0);
  const invalid = setup();
  assert.equal((await invalid.post({ participant_id: "invalid" })).status, 400);
  assert.equal(invalid.databaseCalls, 0);
});

test("closed, expired and drawn events cannot replace edit links", async () => {
  for (const options of [{ closed: true }, { expired: true }, { drawn: true }]) {
    const route = setup(options);
    assert.equal((await route.post()).status, 403);
    assert.equal(route.databaseCalls, 0);
    assert.equal(route.messages.length, 0);
  }
});

test("replacement hashes a fresh token, scopes the write to the admin event, and emails the saved link", async () => {
  const route = setup(), response = await route.post(), result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const url = new URL(result.editUrl), token = url.searchParams.get("token")!;
  assert.equal(url.origin, "https://exchange.example");
  assert.equal(url.pathname, "/edit");
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(route.patch!.edit_token_hash, hashToken(token));
  assert.notEqual(route.patch!.edit_token_hash, token);
  assert.deepEqual(route.filters, { id: participantId, event_id: "event-a" });
  assert.equal(result.emailSent, true);
  assert.equal(route.messages[0].to, "alex@example.com");
  assert.ok(route.messages[0].html.includes(result.editUrl));
  assert.match(route.messages[0].html, /Alex &lt;Guest&gt;/);
  assert.match(route.messages[0].html, /Gift &lt;Exchange&gt;/);
  const second = await (await route.post()).json();
  assert.notEqual(second.editUrl, result.editUrl);
});

test("missing or other-event participant is not emailed", async () => {
  const route = setup({ missing: true });
  assert.equal((await route.post()).status, 404);
  assert.equal(route.filters.event_id, "event-a");
  assert.equal(route.messages.length, 0);
});

test("database failures and a concurrent registration closure never send an unsaved link", async () => {
  for (const [message, status] of [["Registration is closed", 403], ["Database unavailable", 500]] as const) {
    const route = setup({ databaseError: message });
    const response = await route.post();
    assert.equal(response.status, status);
    assert.equal(route.messages.length, 0);
    assert.equal((await response.json()).editUrl, undefined);
  }
});

test("SMTP failure returns the persisted replacement for manual sharing", async () => {
  const route = setup({ smtpFails: true }), response = await route.post(), result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.emailSent, false);
  assert.match(result.message, /email could not be sent/);
  assert.match(result.message, /previous link no longer works/);
  assert.equal(route.patch!.edit_token_hash, hashToken(new URL(result.editUrl).searchParams.get("token")!));
});
