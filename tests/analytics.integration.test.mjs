import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import express from "express";
import { createAnalyticsStore } from "../server/analytics-store.mjs";
import { mountAnalytics } from "../server/analytics.mjs";
let cluster,
  pool,
  store,
  server,
  base,
  dir,
  geoLookupIp,
  stamp = new Date();
const ids = {
  user: randomUUID(),
  visitor: randomUUID(),
  visitorId: randomUUID(),
};
const pulse = (kind = "user", sequence = 0, seconds = 0) => ({
  kind,
  sessionId: ids[kind],
  ...(kind === "visitor" ? { visitorId: ids.visitorId } : {}),
  sequence,
  active: true,
  section: kind === "visitor" ? "sales" : "flashcards",
  sections: [
    {
      section: kind === "visitor" ? "sales" : "flashcards",
      seconds,
      reviews: kind === "user" ? 3 : 0,
      visits: 1,
    },
  ],
});
const call = (route, uid, body) =>
  fetch(base + route, {
    method: body ? "POST" : "GET",
    headers: {
      "content-type": "application/json",
      ...(uid ? { "x-test-user": String(uid) } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
test.before(async () => {
  const socket = net.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  dir = await mkdtemp(path.join(os.tmpdir(), "items-analytics-"));
  cluster = new EmbeddedPostgres({
    databaseDir: path.join(dir, "pg"),
    port,
    user: "postgres",
    password: "test-only",
    persistent: false,
    postgresFlags: ["-h", "127.0.0.1"],
    onLog: () => {},
    onError: () => {},
  });
  await cluster.initialise();
  await cluster.start();
  pool = new pg.Pool({
    connectionString: `postgresql://postgres:test-only@127.0.0.1:${port}/postgres`,
  });
  await pool.query(
    "CREATE TABLE users(id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL,created_at TEXT NOT NULL);INSERT INTO users(email,created_at) VALUES('hello@setup-hub.com',NOW()::text),('user@test.invalid',NOW()::text),('another@test.invalid',NOW()::text)",
  );
  store = createAnalyticsStore(pool, { now: () => stamp });
  await store.init();
  const app = express();
  app.use(express.json());
  mountAnalytics(app, {
    store,
    pool,
    authenticate: (req) =>
      req.headers["x-test-user"]
        ? { uid: Number(req.headers["x-test-user"]) }
        : null,
    adminEmails: ["hello@setup-hub.com"],
    limiter: (_req, _res, next) => next(),
    geo: {
      lookup: (ip) => {
        geoLookupIp = ip;
        return {
          country: "FR",
          city: "Paris",
          latitude: 48.9,
          longitude: 2.3,
        };
      },
      status: () => ({ ready: true }),
    },
  });
  app.use((e, _req, res, _next) => res.status(500).json({ error: e.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await pool?.end();
  await cluster?.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("admin metrics require server authorization; anonymous and registered tracking stay separate", async () => {
  assert.equal((await call("/api/admin/analytics")).status, 401);
  assert.equal((await call("/api/admin/analytics", 2)).status, 403);
  assert.equal((await call("/api/analytics/pulse", null, pulse())).status, 401);
  assert.deepEqual(
    await (
      await call("/api/analytics/pulse", 1, {
        ...pulse(),
        sessionId: randomUUID(),
      })
    ).json(),
    { ok: true, disabled: true },
  );
  assert.equal((await call("/api/analytics/pulse", 2, pulse())).status, 200);
  assert.equal(
    (await call("/api/analytics/pulse", null, pulse("visitor"))).status,
    200,
  );
  const res = await call("/api/admin/analytics?days=30", 1);
  assert.equal(res.status, 200, await res.clone().text());
  const data = await res.json();
  assert.equal(data.metrics.registered, 3);
  assert.equal(data.metrics.users, 1);
  assert.equal(data.metrics.visitors, 1);
  assert.equal(data.metrics.live_users, 1);
  assert.equal(data.metrics.live_visitors, 1);
  assert.equal(data.metrics.reviews, 3);
  assert.equal(data.locations[0].city, "Paris");
  assert.equal(data.daily.length, 1);
  assert.ok(data.users.some((u) => /^USR-[A-F0-9]{32}$/.test(u.entity)));
  assert.ok(data.users.some((u) => /^VIS-[A-F0-9]{32}$/.test(u.entity)));
  const raw = JSON.stringify(data);
  for (const field of [
    "user@test.invalid",
    "hello@setup-hub.com",
    "password",
    "user_id",
    "visitor_id",
    "snapshot",
    "display_name",
  ])
    assert.ok(!raw.includes(field), field);
});
test("retry and out-of-order counters cannot double count; sessions cannot be hijacked", async () => {
  stamp = new Date(stamp.getTime() + 30000);
  let res = await call("/api/analytics/pulse", 2, pulse("user", 1, 30));
  assert.equal(res.status, 200);
  await call("/api/analytics/pulse", 2, pulse("user", 1, 30));
  await call("/api/analytics/pulse", 2, pulse("user", 0, 0));
  let data = await (await call("/api/admin/analytics", 1)).json();
  assert.equal(data.metrics.active_seconds, 30);
  assert.equal(data.metrics.reviews, 3);
  assert.equal(
    (await call("/api/analytics/pulse", 3, pulse("user", 2, 60))).status,
    403,
  );
  assert.equal(
    (
      await call("/api/analytics/pulse", null, {
        ...pulse("visitor", 2),
        sessionId: ids.user,
      })
    ).status,
    403,
  );
  const u = data.users.find((u) => u.kind === "user");
  res = await call("/api/admin/analytics/entities/" + u.entity, 1);
  assert.equal(res.status, 200);
  data = await res.json();
  assert.equal(data.sessions[0].seconds, 30);
  assert.equal(
    (await call("/api/admin/analytics/entities/" + u.entity, 3)).status,
    403,
  );
});
test("country and live filters, complete pseudonymous account list, validation and retention", async () => {
  let data = await (await call("/api/admin/analytics?country=BE", 1)).json();
  assert.equal(data.metrics.sessions, 0);
  data = await (
    await call(
      "/api/admin/analytics?kind=user&entityKind=user&allAccounts=true",
      1,
    )
  ).json();
  assert.equal(data.users.length, 3);
  assert.equal(data.users.filter((u) => u.last_seen === null).length, 2);
  const id = data.users[0].entity;
  data = await (
    await call("/api/admin/analytics?entityKind=user&search=" + id, 1)
  ).json();
  assert.equal(data.users.length, 1);
  for (const q of [
    "days=500",
    "page=-1",
    "timeZone=bad-zone",
    "entityKind=admin",
    "country=abcdef",
  ])
    assert.equal((await call("/api/admin/analytics?" + q, 1)).status, 400, q);
  stamp = new Date(stamp.getTime() + 100000);
  data = await (await call("/api/admin/analytics?live=true", 1)).json();
  assert.equal(data.metrics.live_users, 0);
  assert.equal(data.metrics.live_visitors, 0);
  assert.equal(data.users.length, 0);
  assert.equal(
    (await call("/api/analytics/pulse", 2, { ...pulse(), userId: 3 })).status,
    400,
  );
  assert.equal(
    (
      await call("/api/analytics/pulse", null, {
        ...pulse("visitor"),
        sections: [{ section: "sales", seconds: 1, reviews: 2, visits: 1 }],
      })
    ).status,
    400,
  );
  await pool.query(
    "UPDATE analytics_sessions SET started_at=NOW()-INTERVAL '13 months'",
  );
  await store.purge();
  assert.equal(
    (await pool.query("SELECT COUNT(*)::int count FROM analytics_sessions"))
      .rows[0].count,
    0,
  );
  assert.equal(
    (
      await pool.query(
        "SELECT COUNT(*)::int count FROM analytics_session_sections",
      )
    ).rows[0].count,
    0,
  );
});
test("analytics use the visitor address before Render proxy addresses", async () => {
  const response = await fetch(base + "/api/analytics/pulse", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": "203.0.113.42, 172.70.10.2, 10.0.0.1",
    },
    body: JSON.stringify({
      ...pulse("visitor"),
      sessionId: randomUUID(),
      visitorId: randomUUID(),
    }),
  });
  assert.equal(response.status, 200);
  assert.equal(geoLookupIp, "203.0.113.42");
});
