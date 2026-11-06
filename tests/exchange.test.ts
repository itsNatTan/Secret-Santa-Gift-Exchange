import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { makeSecretSanta } from "../lib/matching.ts";
import { adminCookieValue, adminEventId, hashToken, newToken, normalizeCode } from "../lib/security.ts";
import { participantDetails } from "../lib/participant.ts";
import { siteUrl } from "../lib/site-url.ts";

test("registration links use the request origin when the site URL is unset", () => {
  assert.equal(siteUrl("https://exchange.vercel.app/api/register", ""), "https://exchange.vercel.app");
  assert.equal(siteUrl("http://localhost:3000/api/register", "   "), "http://localhost:3000");
  assert.equal(siteUrl("https://preview.vercel.app/api/register", "https://exchange.example.com/"), "https://exchange.example.com");
  assert.throws(() => siteUrl("https://exchange.vercel.app/api/register", "javascript:alert(1)"), /HTTP or HTTPS/);
});

test("draw assigns everyone exactly once, with no self or reciprocal assignments", () => {
  assert.throws(() => makeSecretSanta(["one", "two"]));
  for (const size of [3, 4, 5, 10, 30, 100]) {
    const ids = Array.from({ length: size }, (_, i) => String(i));
    for (let trial = 0; trial < 20; trial++) {
      const pairs = makeSecretSanta(ids), map = new Map(pairs.map(p => [p.giver_id, p.recipient_id]));
      assert.equal(map.size, size);
      assert.equal(new Set(map.values()).size, size);
      for (const [giver, recipient] of map) {
        assert.notEqual(giver, recipient);
        assert.notEqual(map.get(recipient), giver);
      }
    }
  }
});
test("admin sessions are bound to one event, signed, and expire", () => {
  process.env.ADMIN_SESSION_SECRET = "a-long-test-only-secret";
  const session = adminCookieValue("event-a");
  assert.equal(adminEventId(session), "event-a");
  assert.equal(adminEventId(session.replace("event-a", "event-b")), null);
  assert.equal(adminEventId(session + ".extra"), null);
  const old = "event-a.1";
  assert.equal(adminEventId(`${old}.${createHmac("sha256", process.env.ADMIN_SESSION_SECRET).update(old).digest("hex")}`), null);
  assert.equal(adminEventId("nscc-admin.old-global-cookie"), null);
  const token = newToken();
  assert.equal(token.length, 64);
  assert.notEqual(hashToken(token), token);
  assert.equal(normalizeCode(" abcd-1234 "), "ABCD1234");
});
test("participant edits trim names and bound input sizes", () => {
  const details = participantDetails({ name: "  Alex  ", likes: "x".repeat(2000) });
  assert.equal(details.name, "Alex");
  assert.deepEqual(Object.keys(details).sort(), ["name", "categories", "likes", "dislikes", "updated_at"].sort());
  assert.equal(details.likes.length, 1000);
});
