import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as matching from "../lib/matching.ts";

function setup(route: "forced-pairs" | "draw" | "edit-draw" | "confirm-draw" | "send-pending", options: { unauthorised?: boolean; drawn?: boolean; commitError?: boolean; confirmed?: boolean; smtpFails?: boolean } = {}) {
  const filters: Record<string, unknown> = {};
  let saved: unknown, committed: { pairs: matching.AssignmentPair[]; target_event: string; expected_revision?: number } | undefined, emailed = false;
  const rpcCalls: string[] = [];
  const pairs = [{ giver_id: "a", recipient_id: "b" }];
  const participants = {
    select() { return participants; },
    async eq(key: string, value: string) { filters[`participants.${key}`] = value; return { data: ["a", "b", "c"].map(id => ({ id })), error: null }; }
  };
  const events = {
    update(value: { forced_pairs: unknown }) { saved = value.forced_pairs; return events; },
    select() { return events; },
    eq(key: string, value: unknown) { filters[`events.${key}`] = value; return events; },
    async single() { return { data: { forced_pairs: pairs, draw_confirmed: !!options.confirmed }, error: null }; },
    async maybeSingle() { return { data: options.drawn ? null : { id: "event-a" }, error: null }; }
  };
  const db = {
    from: (table: string) => table === "participants" ? participants : events,
    rpc: async (name: string, args: typeof committed) => { rpcCalls.push(name); committed = args; return { error: options.commitError ? new Error("Draw changed") : null }; }
  };
  const exports: { POST?: (req: Request) => Promise<Response> } = {};
  const source = ts.transpileModule(readFileSync(new URL(`../app/api/admin/${route}/route.ts`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  runInNewContext(source, { exports, console: { error() {} }, require: (id: string) => {
    if (id === "@/lib/server") return { currentAdminEvent: async () => options.unauthorised ? null : "event-a", database: () => db };
    if (id === "@/lib/matching") return matching;
    if (id === "@/lib/assignment-email") return { deliverAssignments: async () => { emailed = true; if (options.smtpFails) throw new Error("SMTP unavailable"); return "Emails sent"; } };
    if (id === "next/server") return { NextResponse: { json: Response.json } };
    throw new Error(`Unexpected import: ${id}`);
  } });
  return {
    post: (forced_pairs: unknown = pairs) => exports.POST!(new Request("https://exchange.example/api/admin/" + route, { method: "POST", body: JSON.stringify({ forced_pairs }) })),
    postBody: (body: unknown) => exports.POST!(new Request("https://exchange.example/api/admin/" + route, { method: "POST", body: JSON.stringify(body) })),
    filters, rpcCalls, get saved() { return saved; }, get committed() { return committed; }, get emailed() { return emailed; }
  };
}

test("saving forced pairings requires an admin and scopes all writes to their undrawn event", async () => {
  const unauthorised = setup("forced-pairs", { unauthorised: true });
  assert.equal((await unauthorised.post()).status, 401);
  assert.equal(unauthorised.saved, undefined);
  const route = setup("forced-pairs");
  assert.equal((await route.post()).status, 200);
  assert.equal(route.filters["participants.event_id"], "event-a");
  assert.equal(route.filters["events.id"], "event-a");
  assert.equal(route.filters["events.assignments_generated"], false);
  assert.equal(JSON.stringify(route.saved), JSON.stringify([{ giver_id: "a", recipient_id: "b" }]));
});

test("review endpoints reject unauthorised requests and invalid revisions without emails", async () => {
  for (const endpoint of ["edit-draw", "confirm-draw", "send-pending"] as const) {
    const route = setup(endpoint, { unauthorised: true });
    assert.equal((await route.postBody({ revision: 1 })).status, 401);
    assert.equal(route.rpcCalls.length, 0);
    assert.equal(route.emailed, false);
  }
  for (const endpoint of ["edit-draw", "confirm-draw"] as const) {
    for (const revision of [undefined, null, 0, -1, 1.5, "1"]) {
      const route = setup(endpoint);
      assert.equal((await route.postBody({ revision })).status, 400);
      assert.equal(route.rpcCalls.length, 0);
      assert.equal(route.emailed, false);
    }
  }
});

test("draft edits require a complete valid pairing, save to the current event and never email", async () => {
  const pairs = [{ giver_id: "a", recipient_id: "c" }, { giver_id: "c", recipient_id: "b" }, { giver_id: "b", recipient_id: "a" }];
  const route = setup("edit-draw");
  assert.equal((await route.postBody({ revision: 2, pairs })).status, 200);
  assert.deepEqual(route.rpcCalls, ["edit_draft_draw"]);
  assert.equal(route.committed!.target_event, "event-a");
  assert.equal(route.committed!.expected_revision, 2);
  assert.equal(route.emailed, false);
  for (const invalid of [pairs.slice(1), [...pairs.slice(1), { giver_id: "a", recipient_id: "outside" }], [...pairs.slice(1), { giver_id: "a", recipient_id: "a" }]]) {
    const invalidRoute = setup("edit-draw");
    assert.equal((await invalidRoute.postBody({ revision: 2, pairs: invalid })).status, 400);
    assert.equal(invalidRoute.rpcCalls.length, 0);
  }
  const conflict = setup("edit-draw", { commitError: true });
  assert.equal((await conflict.postBody({ revision: 2, pairs })).status, 409);
  assert.equal(conflict.emailed, false);
});

test("confirmation emails only after confirming the reviewed revision and preserves failed delivery for retry", async () => {
  const route = setup("confirm-draw");
  assert.equal((await route.postBody({ revision: 3 })).status, 200);
  assert.deepEqual(route.rpcCalls, ["confirm_draw"]);
  assert.equal(route.committed!.target_event, "event-a");
  assert.equal(route.committed!.expected_revision, 3);
  assert.equal(route.emailed, true);
  const conflict = setup("confirm-draw", { commitError: true });
  assert.equal((await conflict.postBody({ revision: 3 })).status, 409);
  assert.equal(conflict.emailed, false);
  const smtpFailure = setup("confirm-draw", { smtpFails: true });
  const response = await smtpFailure.postBody({ revision: 3 });
  assert.equal(response.status, 200);
  assert.match((await response.json()).message, /Draw confirmed.*retry/);
});

test("send-pending refuses draft emails and only sends for a confirmed event", async () => {
  const draft = setup("send-pending");
  assert.equal((await draft.post()).status, 409);
  assert.equal(draft.emailed, false);
  const confirmed = setup("send-pending", { confirmed: true });
  assert.equal((await confirmed.post()).status, 200);
  assert.equal(confirmed.filters["events.id"], "event-a");
  assert.equal(confirmed.emailed, true);
});

test("invalid and other-event forced pairings are rejected without saving", async () => {
  for (const pairs of [null, [{ giver_id: "a", recipient_id: "outside" }], [{ giver_id: "a", recipient_id: "a" }], [{ giver_id: "a", recipient_id: "b" }, { giver_id: "b", recipient_id: "a" }]]) {
    const route = setup("forced-pairs");
    assert.equal((await route.post(pairs)).status, 400);
    assert.equal(route.saved, undefined);
  }
});

test("pairings can be cleared before the draw and cannot be saved after it", async () => {
  const route = setup("forced-pairs");
  assert.equal((await route.post([])).status, 200);
  assert.equal(JSON.stringify(route.saved), "[]");
  const drawn = setup("forced-pairs", { drawn: true });
  assert.equal((await drawn.post()).status, 409);
});

test("draw honours saved forced pairings and never sends emails during generation", async () => {
  const route = setup("draw");
  assert.equal((await route.post()).status, 200);
  assert.equal(route.committed!.target_event, "event-a");
  assert.ok(route.committed!.pairs.some(pair => pair.giver_id === "a" && pair.recipient_id === "b"));
  assert.equal(route.emailed, false);
  const conflict = setup("draw", { commitError: true });
  assert.equal((await conflict.post()).status, 409);
  assert.equal(conflict.emailed, false);
});
