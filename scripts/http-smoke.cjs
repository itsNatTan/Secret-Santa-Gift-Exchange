const assert = require("node:assert/strict");
(async () => {
  const base = process.env.SMOKE_BASE_URL || "http://localhost:3100";
  const home = await fetch(base);
  assert.equal(home.status, 200);
  const html = await home.text();
  assert.match(html, /Create an exchange/); assert.match(html, /Join an exchange/);
  const admin = await fetch(base + "/admin");
  assert.equal(admin.status, 200); assert.match(await admin.text(), /Private admin code/);
  for (const [route, method] of [["data", "GET"], ["close", "POST"], ["settings", "POST"], ["draw", "POST"], ["send-pending", "POST"], ["replace-edit-link", "POST"], ["forced-pairs", "POST"], ["edit-draw", "POST"], ["confirm-draw", "POST"]]) {
    const response = await fetch(base + "/api/admin/" + route, { method });
    assert.equal(response.status, 401, route);
  }
  const invalid = await fetch(base + "/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "" }) });
  assert.equal(invalid.status, 400);
  const noEvent = await fetch(base + "/api/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(noEvent.status, 400);
  console.log("HTTP smoke checks passed: home, admin login, nine protected admin endpoints, invalid event creation, and registration without an event.");
})().catch(e => { console.error(e); process.exitCode = 1; });
