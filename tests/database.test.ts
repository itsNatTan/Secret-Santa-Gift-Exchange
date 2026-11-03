import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const sql = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").replace("create extension if not exists pgcrypto;", "");
async function setup() {
  const db = new PGlite();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  return db;
}
async function addPerson(db: PGlite, event: string, email: string) {
  return (await db.query<{ id: string }>("insert into participants(event_id, name, email, edit_token_hash) values ($1, 'Alex', $2, $2) returning id", [event, email])).rows[0].id;
}
function cycle(ids: string[]) {
  return ids.map((giver_id, i) => ({ giver_id, recipient_id: ids[(i + 1) % ids.length] }));
}

test("fresh schema isolates events, locks registration, commits one draw, and claims pending emails", async () => {
  const db = await setup();
  try {
    await db.exec(sql("../supabase/schema.sql"));
    const events = (await db.query<{ id: string }>("insert into events(name, join_code, admin_code_hash) values ('A', 'AAAA', 'hash-a'), ('B', 'BBBB', 'hash-b') returning id")).rows;
    const [a, b] = events.map(e => e.id);
    const ids = await Promise.all([addPerson(db, a, "one@example.com"), addPerson(db, a, "two@example.com"), addPerson(db, a, "three@example.com")]);
    const otherId = await addPerson(db, b, "one@example.com"); // Same email in another event is allowed.
    await assert.rejects(addPerson(db, a, "one@example.com"), /unique/i);
    await assert.rejects(db.query("select commit_draw($1, $2::jsonb)", [a, JSON.stringify(cycle([ids[0], ids[1], otherId]))]), /foreign key/i);
    assert.equal((await db.query("select * from assignments")).rows.length, 0);
    await assert.rejects(db.query("select commit_draw($1, $2::jsonb)", [a, JSON.stringify(cycle(ids.slice(0, 2)))]), /Participant list changed/);
    await db.query("select commit_draw($1, $2::jsonb)", [a, JSON.stringify(cycle(ids))]);
    await assert.rejects(db.query("select commit_draw($1, $2::jsonb)", [a, JSON.stringify(cycle(ids))]), /already generated/);
    await assert.rejects(addPerson(db, a, "late@example.com"), /Registration is closed/);
    await assert.rejects(db.query("update participants set likes = 'late edit' where id = $1", [ids[0]]), /Registration is closed/);
    await addPerson(db, b, "still-open@example.com");
    assert.deepEqual((await db.query<{ registration_open: boolean; assignments_generated: boolean }>("select registration_open, assignments_generated from events where id = $1", [b])).rows[0], { registration_open: true, assignments_generated: false });
    assert.equal((await db.query("select * from claim_assignment_emails($1)", [b])).rows.length, 0);
    assert.equal((await db.query("select * from claim_assignment_emails($1)", [a])).rows.length, 3);
    assert.equal((await db.query("select * from claim_assignment_emails($1)", [a])).rows.length, 0);
    await db.query("update assignments set email_claimed_at = now() - interval '3 minutes' where event_id = $1", [a]);
    assert.equal((await db.query("select * from claim_assignment_emails($1)", [a])).rows.length, 3);
    await db.query("update assignments set emailed_at = now() where event_id = $1", [a]);
    assert.equal((await db.query("select * from claim_assignment_emails($1)", [a])).rows.length, 0);
    await db.exec("set role anon");
    await assert.rejects(db.query("select commit_draw($1, '[]'::jsonb)", [b]), /permission denied/);
    await assert.rejects(db.query("select * from claim_assignment_emails($1)", [a]), /permission denied/);
  } finally { await db.close(); }
});

test("migration preserves the original event, edit tokens and assignments", async () => {
  const db = await setup();
  try {
    await db.exec(sql("./fixtures/legacy-schema.sql"));
    const people = (await db.query<{ id: string }>("insert into participants(name,email,edit_token_hash) values ('One','one@example.com','old-token-one'), ('Two','two@example.com','old-token-two'), ('Three','three@example.com','old-token-three') returning id")).rows.map(p => p.id);
    for (const pair of cycle(people)) await db.query("insert into assignments(giver_id, recipient_id) values ($1,$2)", [pair.giver_id, pair.recipient_id]);
    await db.exec("update event_settings set gift_budget = 'S$42', registration_open = false, assignments_generated = true");
    await db.exec(sql("../supabase/migrations/20261103_multi_event.sql"));
    const event = (await db.query<{ id: string; gift_budget: string; assignments_generated: boolean }>("select * from events where join_code = 'NSCC2026'")).rows[0];
    assert.equal(event.gift_budget, "S$42"); assert.equal(event.assignments_generated, true);
    assert.equal((await db.query("select * from assignments where event_id = $1", [event.id])).rows.length, 3);
    assert.equal((await db.query("select * from participants where edit_token_hash = 'old-token-one' and event_id = $1", [event.id])).rows.length, 1);
    await assert.rejects(db.query("select commit_draw($1, $2::jsonb)", [event.id, JSON.stringify(cycle(people))]), /already generated/);
    const newEvent = (await db.query<{ id: string }>("insert into events(name,join_code,admin_code_hash) values ('New','NEW','hash') returning id")).rows[0].id;
    await addPerson(db, newEvent, "one@example.com");
  } finally { await db.close(); }
});
