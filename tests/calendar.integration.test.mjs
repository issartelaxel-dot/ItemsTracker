import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import express from "express";
import { DOMParser } from "@xmldom/xmldom";
import { createCalendarStore } from "../server/calendar-store.mjs";
import { mountCalendar } from "../server/calendar.mjs";
import {
  normalizeEvent,
  toICS,
  fromICS,
  wallToUTC,
} from "../server/calendar-model.mjs";
let cluster, pool, store, server, base, dir, u1, u2;
const freePort = async () => {
  const s = net.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const p = s.address().port;
  await new Promise((r) => s.close(r));
  return p;
};
const event = (overrides = {}) => ({
  id: "test-event",
  title: "Révision café & cœur",
  kind: "revision",
  activity: "flashcards",
  start: "2026-10-26T09:00",
  end: "2026-10-26T10:00",
  timeZone: "Europe/Paris",
  notes: "Première ligne\nDeuxième ligne",
  itemNumbers: [1],
  colleges: ["Médecine Interne"],
  cardKeys: ["1::a"],
  completed: false,
  reminderMinutes: 15,
  ...overrides,
});
const request = (uid, url, method = "GET", body, headers = {}) =>
  fetch(base + url, {
    method,
    headers: {
      "x-test-user": String(uid),
      "content-type": "application/json",
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const dav = (token, url, method = "PROPFIND", body = "", headers = {}) =>
  fetch(base + url, {
    method,
    headers: {
      Authorization:
        "Basic " +
        Buffer.from(token.username + ":" + token.password).toString("base64"),
      "content-type": method === "PUT" ? "text/calendar" : "application/xml",
      ...headers,
    },
    ...(body ? { body } : {}),
  });
test.before(async () => {
  const pgPort = await freePort();
  dir = await mkdtemp(path.join(os.tmpdir(), "items-calendar-test-"));
  cluster = new EmbeddedPostgres({
    databaseDir: path.join(dir, "pg"),
    port: pgPort,
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
    connectionString:
      "postgresql://postgres:test-only@127.0.0.1:" + pgPort + "/postgres",
  });
  await pool.query(
    "CREATE TABLE users(id SERIAL PRIMARY KEY,email TEXT NOT NULL)",
  );
  u1 = (
    await pool.query(
      "INSERT INTO users(email) VALUES('one@example.test') RETURNING id",
    )
  ).rows[0].id;
  u2 = (
    await pool.query(
      "INSERT INTO users(email) VALUES('two@example.test') RETURNING id",
    )
  ).rows[0].id;
  store = createCalendarStore(pool);
  await store.init();
  const app = express();
  app.use(express.json());
  mountCalendar(app, {
    store,
    authenticate: (req) =>
      req.headers["x-test-user"]
        ? { uid: Number(req.headers["x-test-user"]) }
        : null,
    limiter: (_req, _res, next) => next(),
    env: { NODE_ENV: "test" },
  });
  app.use((e, _req, res, _next) => res.status(500).json({ error: e.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = "http://127.0.0.1:" + server.address().port;
});
test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
  if (cluster) await cluster.stop();
  if (dir) await rm(dir, { recursive: true, force: true });
});
test("time zones, DST and iCalendar escaped text / alarms / metadata", () => {
  assert.equal(
    wallToUTC("2026-10-26T09:00", "Europe/Paris"),
    "2026-10-26T08:00:00.000Z",
  );
  assert.equal(
    wallToUTC("2026-07-26T09:00", "Europe/Paris"),
    "2026-07-26T07:00:00.000Z",
  );
  assert.throws(
    () => wallToUTC("2026-03-29T02:30", "Europe/Paris"),
    /n’existe pas/,
  );
  const data = normalizeEvent(event()),
    raw = toICS(data),
    parsed = fromICS(raw, data.id, data);
  assert.equal(parsed.data.title, data.title);
  assert.equal(parsed.data.notes, data.notes);
  assert.equal(parsed.data.reminderMinutes, 15);
  assert.deepEqual(parsed.data.cardKeys, data.cardKeys);
  assert.throws(
    () =>
      fromICS(
        raw.replace("BEGIN:VEVENT", "BEGIN:VEVENT\r\nRRULE:FREQ=DAILY"),
        data.id,
      ),
    /répétitions/,
  );
});
test("real PostgreSQL + REST / DAV discovery, edits, ETags, reports, deletion, account isolation and revocation", async () => {
  const created = await request(
    u1,
    "/api/calendar/events/test-event",
    "PUT",
    event(),
    { "If-None-Match": "*" },
  );
  assert.equal(created.status, 200, await created.clone().text());
  let row = (await created.json()).event;
  assert.equal((await request(u2, "/api/calendar")).status, 200);
  assert.deepEqual(
    (await (await request(u2, "/api/calendar")).json()).events,
    [],
  );
  const token = await store.issue(u1, "iPhone", "Europe/Paris"),
    other = await store.issue(u2, "Other", "UTC"),
    home = "/dav/calendars/" + u1 + "/itemstracker/",
    href = home + "test-event.ics";
  const options = await dav(token, "/dav/", "OPTIONS");
  assert.match(options.headers.get("dav"), /calendar-access/);
  const root = await dav(
    token,
    "/dav/",
    "PROPFIND",
    '<d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>',
  );
  assert.equal(root.status, 207);
  assert.match(await root.text(), new RegExp("/dav/principals/" + u1 + "/"));
  assert.equal((await dav(other, href, "GET")).status, 404);
  const multiget =
    '<c:calendar-multiget xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:d="DAV:"><d:prop><d:getetag/><c:calendar-data/></d:prop><d:href>' +
    href +
    "</d:href></c:calendar-multiget>";
  const mg = await dav(token, home, "REPORT", multiget);
  assert.equal(mg.status, 207);
  const xml = await mg.text();
  assert.match(xml, /calendar-data/);
  assert.match(xml, /&amp;/);
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  assert.equal(
    doc.getElementsByTagNameNS("urn:ietf:params:xml:ns:caldav", "calendar-data")
      .length,
    1,
  );
  let read = await dav(token, href, "GET"),
    etag = read.headers.get("etag"),
    raw = await read.text();
  assert.equal(read.status, 200);
  const edit = await dav(
    token,
    href,
    "PUT",
    raw.replace("Révision café & cœur", "Apple modification"),
    { "If-Match": etag },
  );
  assert.equal(edit.status, 204, await edit.text());
  row = (await (await request(u1, "/api/calendar")).json()).events[0];
  assert.equal(row.title, "Apple modification");
  assert.deepEqual(row.itemNumbers, [1]);
  assert.equal(row.completed, false);
  assert.equal(
    (
      await request(
        u1,
        "/api/calendar/events/test-event",
        "PUT",
        event({ title: "Stale" }),
        { "If-Match": etag },
      )
    ).status,
    412,
  );
  const competing = await Promise.all(
    ["A", "B"].map((title) =>
      request(u1, "/api/calendar/events/test-event", "PUT", event({ title }), {
        "If-Match": row.etag,
      }),
    ),
  );
  assert.deepEqual(competing.map((r) => r.status).sort(), [200, 412]);
  const sync = (tokenText) =>
    '<d:sync-collection xmlns:d="DAV:"><d:sync-token>' +
    tokenText +
    "</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/></d:prop></d:sync-collection>";
  const first = await dav(token, home, "REPORT", sync(""));
  assert.equal(first.status, 207);
  const initial = new DOMParser().parseFromString(
      await first.text(),
      "application/xml",
    ),
    syncToken = initial.getElementsByTagNameNS("DAV:", "sync-token")[0]
      .textContent;
  const bad = await dav(token, home, "REPORT", sync("bad-token"));
  assert.equal(bad.status, 403);
  const latest = await store.get(u1, "test-event");
  assert.equal(
    (await dav(token, href, "DELETE", "", { "If-Match": latest.etag })).status,
    204,
  );
  const changed = await dav(token, home, "REPORT", sync(syncToken));
  assert.match(await changed.text(), /404 Not Found/);
  assert.deepEqual(
    (await (await request(u1, "/api/calendar")).json()).events,
    [],
  );
  assert.equal(
    (
      await dav(
        token,
        home,
        "REPORT",
        '<!DOCTYPE x [<!ENTITY bad SYSTEM "file:///etc/passwd">]><x>&bad;</x>',
      )
    ).status,
    400,
  );
  await store.revoke(u1, token.id);
  assert.equal((await dav(token, home)).status, 401);
});
test("reminder lifecycle: due time, per-user read, completion and deletion", async () => {
  const now = new Date(),
    start = new Date(now.getTime() + 5 * 60000).toISOString().slice(0, 16),
    end = new Date(now.getTime() + 65 * 60000).toISOString().slice(0, 16);
  await store.mutate(
    u1,
    "reminder",
    event({ id: "reminder", start, end, timeZone: "UTC" }),
    { createOnly: true },
  );
  assert.equal((await store.reminders(u1)).length, 1);
  assert.equal((await store.reminders(u2)).length, 0);
  await store.readReminders(u1, ["reminder"]);
  assert.ok((await store.reminders(u1))[0].read_at);
  const previous = await store.get(u1, "reminder");
  await store.mutate(
    u1,
    "reminder",
    { ...previous.data, completed: true },
    { match: previous.etag },
  );
  assert.equal((await store.reminders(u1)).length, 0);
});
test("Apple-style creation with TZID and duration, range queries and later app edit retain the UID", async () => {
  const token = await store.issue(u1, "Mac", "Europe/Paris"),
    home = "/dav/calendars/" + u1 + "/itemstracker/";
  const raw =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//test//Apple-like//FR\r\nBEGIN:VEVENT\r\nUID:external-created@example.test\r\nDTSTAMP:20261012T090000Z\r\nDTSTART;TZID=Europe/Paris:20261110T140000\r\nDURATION:PT1H\r\nSUMMARY:Créée depuis Apple\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:Rappel\r\nTRIGGER:-PT30M\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  const created = await dav(token, home + "external.ics", "PUT", raw, {
    "If-None-Match": "*",
  });
  assert.equal(created.status, 201, await created.text());
  let row = (await (await request(u1, "/api/calendar")).json()).events.find(
    (e) => e.id === "external",
  );
  assert.equal(row.startAt, "2026-11-10T13:00:00.000Z");
  assert.equal(row.reminderMinutes, 30);
  const query = (begin, end) =>
    '<c:calendar-query xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:d="DAV:"><d:prop><d:getetag/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="' +
    begin +
    '" end="' +
    end +
    '"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>';
  assert.match(
    await (
      await dav(
        token,
        home,
        "REPORT",
        query("20261110T000000Z", "20261111T000000Z"),
      )
    ).text(),
    /external.ics/,
  );
  assert.doesNotMatch(
    await (
      await dav(
        token,
        home,
        "REPORT",
        query("20261112T000000Z", "20261113T000000Z"),
      )
    ).text(),
    /external.ics/,
  );
  const saved = await request(
    u1,
    "/api/calendar/events/external",
    "PUT",
    { ...row, title: "Modifiée dans ItemsTracker", completed: true },
    { "If-Match": row.etag },
  );
  assert.equal(saved.status, 200);
  const exported = await (
    await dav(token, home + "external.ics", "GET")
  ).text();
  assert.match(exported, /UID:external-created@example.test/);
  assert.doesNotMatch(exported, /DURATION:/);
  assert.match(exported, /DTEND:20261110T140000Z/);
  assert.equal(
    (await dav({ ...token, password: "ordinary-account-password" }, home))
      .status,
    401,
  );
});
test("status edit retains exact instants during the repeated daylight-saving hour", async () => {
  const raw =
    "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:dst@example.test\r\nDTSTART:20261025T004500Z\r\nDTEND:20261025T011500Z\r\nSUMMARY:Retour à l’heure d’hiver\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n";
  const { row } = await store.mutate(u1, "dst", raw, {
    ics: true,
    createOnly: true,
  });
  assert.equal(row.data.start, "2026-10-25T02:45");
  assert.equal(row.data.end, "2026-10-25T02:15");
  const updated = await store.mutate(
    u1,
    "dst",
    { ...row.data, completed: true },
    { match: row.etag },
  );
  assert.equal(updated.row.data.startAt, row.data.startAt);
  assert.equal(updated.row.data.endAt, row.data.endAt);
});
