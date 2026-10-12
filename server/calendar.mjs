import express from "express";
import { DOMParser } from "@xmldom/xmldom";
import { z } from "zod";
import { CalendarError } from "./calendar-model.mjs";
const D = "DAV:",
  C = "urn:ietf:params:xml:ns:caldav";
const escape = (value) =>
  String(value ?? "").replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
const namespaces =
  'xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:cs="http://calendarserver.org/ns/" xmlns:a="http://apple.com/ns/ical/"';
const xml = (res, status, body) =>
  res
    .status(status)
    .type("application/xml")
    .send('<?xml version="1.0" encoding="utf-8"?>' + body);
const multi = (res, responses, tail = "") =>
  xml(
    res,
    207,
    `<d:multistatus ${namespaces}>${responses.join("")}${tail}</d:multistatus>`,
  );
const nodes = (root, ns, name) =>
  Array.from(root.getElementsByTagNameNS(ns, name));
function document(raw) {
  if (!raw) return null;
  if (/<!DOCTYPE|<!ENTITY/i.test(raw))
    throw new CalendarError(400, "XML non autorisé.");
  let invalid = false;
  let doc;
  try {
    doc = new DOMParser({
      onError: () => {
        invalid = true;
      },
    }).parseFromString(raw, "application/xml");
  } catch {
    throw new CalendarError(400, "XML invalide.");
  }
  if (invalid || !doc?.documentElement)
    throw new CalendarError(400, "XML invalide.");
  return doc;
}
const validId = (id) => /^[A-Za-z0-9_.-]{1,120}$/.test(id);
function propResponse(href, properties, doc) {
  const prop = doc && nodes(doc, D, "prop")[0];
  const wanted = prop
    ? Array.from(prop.childNodes).filter((n) => n.nodeType === 1)
    : null;
  const ok = [],
    missing = [];
  if (!wanted) ok.push(...Object.values(properties));
  else
    for (const node of wanted) {
      const value = properties[node.namespaceURI + "|" + node.localName];
      if (value) ok.push(value);
      else
        missing.push(
          "<x:" +
            node.localName +
            ' xmlns:x="' +
            escape(node.namespaceURI) +
            '"/>',
        );
    }
  return `<d:response><d:href>${escape(href)}</d:href>${ok.length ? "<d:propstat><d:prop>" + ok.join("") + "</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>" : ""}${missing.length ? "<d:propstat><d:prop>" + missing.join("") + "</d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>" : ""}</d:response>`;
}
export function mountCalendar(
  app,
  { store, authenticate, limiter, env = process.env },
) {
  const auth = (req, res, next) => {
    const a = authenticate(req);
    if (!a || !Number.isSafeInteger(Number(a.uid)) || Number(a.uid) < 1)
      return res.status(401).json({ error: "Connecte-toi à ItemsTracker." });
    req.calendarUid = Number(a.uid);
    res.set("Cache-Control", "private, no-store");
    next();
  };
  const run = (fn) => async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (e) {
      if (e instanceof CalendarError)
        return res.status(e.status).json({ error: e.message });
      next(e);
    }
  };
  app.get(
    "/api/calendar",
    auth,
    run(async (req, res) =>
      res.json({
        events: (await store.list(req.calendarUid)).map((r) => ({
          ...r.data,
          etag: r.etag,
        })),
        updatedAt: new Date().toISOString(),
      }),
    ),
  );
  app.put(
    "/api/calendar/events/:eventId",
    limiter,
    auth,
    run(async (req, res) => {
      if (!validId(req.params.eventId))
        throw new CalendarError(400, "Identifiant invalide.");
      const { row } = await store.mutate(
        req.calendarUid,
        req.params.eventId,
        req.body,
        {
          match: req.get("If-Match"),
          createOnly: req.get("If-None-Match") === "*",
          requireMatch: true,
        },
      );
      res.json({ event: { ...row.data, etag: row.etag } });
    }),
  );
  app.post(
    "/api/calendar/events/:eventId/delete",
    limiter,
    auth,
    run(async (req, res) => {
      if (!validId(req.params.eventId))
        throw new CalendarError(400, "Identifiant invalide.");
      await store.mutate(req.calendarUid, req.params.eventId, null, {
        remove: true,
        match: req.get("If-Match"),
        requireMatch: true,
      });
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/calendar/devices",
    auth,
    run(async (req, res) =>
      res.json({ devices: await store.devices(req.calendarUid) }),
    ),
  );
  app.post(
    "/api/calendar/devices",
    limiter,
    auth,
    run(async (req, res) => {
      const parsed = z
        .object({
          label: z.string().trim().min(1).max(80),
          timeZone: z.string().max(100),
        })
        .safeParse(req.body);
      if (!parsed.success)
        throw new CalendarError(400, "Nom d’appareil ou fuseau invalide.");
      const base = (
        env.CALENDAR_PUBLIC_URL || `${req.protocol}://${req.get("host")}`
      ).replace(/\/+$/, "");
      const url = new URL(base);
      if (env.NODE_ENV === "production" && url.protocol !== "https:")
        throw new CalendarError(
          503,
          "L’adresse HTTPS du calendrier doit être configurée sur le serveur.",
        );
      const data = await store.issue(
        req.calendarUid,
        parsed.data.label,
        parsed.data.timeZone,
      );
      res.status(201).json({
        ...data,
        server: base + "/dav/",
        calendarUrl:
          base + "/dav/calendars/" + req.calendarUid + "/itemstracker/",
      });
    }),
  );
  app.post(
    "/api/calendar/devices/:deviceId/revoke",
    limiter,
    auth,
    run(async (req, res) => {
      await store.revoke(req.calendarUid, req.params.deviceId);
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/calendar/reminders",
    auth,
    run(async (req, res) =>
      res.json({
        reminders: (await store.reminders(req.calendarUid)).map((r) => ({
          id: r.id,
          etag: r.etag,
          title: r.data.title,
          startAt: r.data.startAt,
          read_at: r.read_at,
        })),
      }),
    ),
  );
  app.post(
    "/api/calendar/reminders/read",
    limiter,
    auth,
    run(async (req, res) => {
      const ids = z
        .array(z.string().max(120))
        .max(100)
        .safeParse(req.body?.ids);
      if (!ids.success) throw new CalendarError(400, "Liste invalide.");
      await store.readReminders(req.calendarUid, ids.data);
      res.json({ ok: true });
    }),
  );
  app.all("/.well-known/caldav", (_req, res) => res.redirect(307, "/dav/"));
  app.use(
    "/dav",
    limiter,
    express.text({ type: () => true, limit: "200kb" }),
    async (req, res, next) => {
      res.set({
        DAV: "1, calendar-access",
        Allow: "OPTIONS, PROPFIND, REPORT, GET, HEAD, PUT, DELETE, PROPPATCH",
        "Cache-Control": "private, no-store",
      });
      try {
        if (env.NODE_ENV === "production" && !req.secure)
          throw new CalendarError(403, "HTTPS requis.");
        if (req.method === "OPTIONS") return res.status(200).end();
        const basic = /^Basic (.+)$/i.exec(req.get("Authorization") || "");
        let uid = null;
        if (basic) {
          const credentials = Buffer.from(basic[1], "base64").toString("utf8"),
            split = credentials.indexOf(":");
          if (split > 0)
            uid = await store.authenticate(
              credentials.slice(0, split),
              credentials.slice(split + 1),
            );
        }
        if (!uid) {
          res.set(
            "WWW-Authenticate",
            'Basic realm="ItemsTracker Calendar", charset="UTF-8"',
          );
          return res.status(401).end();
        }
        const principal = "/dav/principals/" + uid + "/",
          home = "/dav/calendars/" + uid + "/",
          collection = home + "itemstracker/";
        let path;
        try {
          path = decodeURIComponent(req.path);
        } catch {
          throw new CalendarError(400, "Chemin invalide.");
        }
        // req.path is relative to /dav. Reject all cross-account paths before reading data.
        const full = "/dav" + path;
        const resource = full.startsWith(collection)
          ? full.slice(collection.length)
          : null;
        const isEvent =
          resource && /\.ics$/.test(resource) && validId(resource.slice(0, -4));
        if (
          !["/dav/", "/dav", principal, home, collection].includes(full) &&
          !isEvent
        )
          return res.status(404).end();
        const id = isEvent ? resource.slice(0, -4) : null;
        const a = await store.account(uid),
          token = "https://itemstracker.invalid/sync/" + uid + "/" + a.revision;
        const common = {
          [D + "|current-user-principal"]:
            `<d:current-user-principal><d:href>${principal}</d:href></d:current-user-principal>`,
          [D + "|principal-URL"]:
            `<d:principal-URL><d:href>${principal}</d:href></d:principal-URL>`,
          [C + "|calendar-home-set"]:
            `<c:calendar-home-set><d:href>${home}</d:href></c:calendar-home-set>`,
          [D + "|current-user-privilege-set"]:
            "<d:current-user-privilege-set><d:privilege><d:read/></d:privilege><d:privilege><d:write/></d:privilege></d:current-user-privilege-set>",
          [D + "|owner"]: `<d:owner><d:href>${principal}</d:href></d:owner>`,
        };
        const reports =
          "<d:supported-report-set>" +
          [
            ["c", "calendar-query"],
            ["c", "calendar-multiget"],
            ["d", "sync-collection"],
          ]
            .map(
              ([ns, name]) =>
                `<d:supported-report><d:report><${ns}:${name}/></d:report></d:supported-report>`,
            )
            .join("") +
          "</d:supported-report-set>";
        const collectionProps = {
          ...common,
          [D + "|resourcetype"]:
            "<d:resourcetype><d:collection/><c:calendar/></d:resourcetype>",
          [D + "|displayname"]: "<d:displayname>ItemsTracker</d:displayname>",
          [D + "|sync-token"]: `<d:sync-token>${token}</d:sync-token>`,
          ["http://calendarserver.org/ns/|getctag"]: `<cs:getctag>${a.revision}</cs:getctag>`,
          [D + "|supported-report-set"]: reports,
          [C + "|supported-calendar-component-set"]:
            '<c:supported-calendar-component-set><c:comp name="VEVENT"/></c:supported-calendar-component-set>',
          [C + "|supported-calendar-data"]:
            '<c:supported-calendar-data><c:calendar-data content-type="text/calendar" version="2.0"/></c:supported-calendar-data>',
          [C + "|max-resource-size"]:
            "<c:max-resource-size>204800</c:max-resource-size>",
          [C + "|calendar-description"]:
            "<c:calendar-description>Séances et examens ItemsTracker</c:calendar-description>",
          ["http://apple.com/ns/ical/|calendar-color"]:
            "<a:calendar-color>#1765EDFF</a:calendar-color>",
        };
        const eventResponse = (row, doc, ics = false) =>
          propResponse(
            collection + encodeURIComponent(row.id) + ".ics",
            {
              ...common,
              [D + "|resourcetype"]: "<d:resourcetype/>",
              [D + "|getetag"]:
                "<d:getetag>" + escape(row.etag) + "</d:getetag>",
              [D + "|getcontenttype"]:
                "<d:getcontenttype>text/calendar; charset=utf-8</d:getcontenttype>",
              [D + "|getcontentlength"]:
                "<d:getcontentlength>" +
                Buffer.byteLength(row.ical) +
                "</d:getcontentlength>",
              [D + "|getlastmodified"]:
                "<d:getlastmodified>" +
                new Date(row.updated_at).toUTCString() +
                "</d:getlastmodified>",
              ...(ics
                ? {
                    [C + "|calendar-data"]:
                      "<c:calendar-data>" +
                      escape(row.ical) +
                      "</c:calendar-data>",
                  }
                : {}),
            },
            doc,
          );
        if (req.method === "PROPFIND") {
          const doc = document(req.body),
            responses = [];
          if (id) {
            const row = await store.get(uid, id);
            if (!row) return res.status(404).end();
            responses.push(eventResponse(row, doc));
          } else {
            const props =
              full === collection
                ? collectionProps
                : {
                    ...common,
                    [D + "|resourcetype"]:
                      full === principal
                        ? "<d:resourcetype><d:principal/></d:resourcetype>"
                        : "<d:resourcetype><d:collection/></d:resourcetype>",
                    [D + "|displayname"]:
                      "<d:displayname>ItemsTracker</d:displayname>",
                  };
            responses.push(propResponse(full, props, doc));
            if (req.get("Depth") !== "0") {
              if (full === home)
                responses.push(propResponse(collection, collectionProps, doc));
              else if (full === collection)
                for (const row of await store.list(uid))
                  responses.push(eventResponse(row, doc));
            }
          }
          return multi(res, responses);
        }
        if (req.method === "REPORT" && full === collection) {
          const doc = document(req.body),
            root = doc?.documentElement;
          if (!root) throw new CalendarError(400, "Rapport XML requis.");
          let rows = [],
            missing = [],
            tail = "";
          if (root.namespaceURI === D && root.localName === "sync-collection") {
            const previous = nodes(doc, D, "sync-token")[0]?.textContent || "",
              level = nodes(doc, D, "sync-level")[0]?.textContent || "1";
            if (level !== "1")
              return xml(
                res,
                403,
                `<d:error ${namespaces}><d:sync-traversal-supported/></d:error>`,
              );
            let since = 0;
            if (previous) {
              const prefix = "https://itemstracker.invalid/sync/" + uid + "/";
              if (
                !previous.startsWith(prefix) ||
                !/^\d+$/.test(previous.slice(prefix.length)) ||
                Number(previous.slice(prefix.length)) > Number(a.revision)
              )
                return xml(
                  res,
                  403,
                  `<d:error ${namespaces}><d:valid-sync-token/></d:error>`,
                );
              since = Number(previous.slice(prefix.length));
            }
            rows = await store.list(uid, {
              deleted: Boolean(previous),
              since,
              until: a.revision,
            });
            tail = "<d:sync-token>" + token + "</d:sync-token>";
          } else if (
            root.namespaceURI === C &&
            root.localName === "calendar-multiget"
          ) {
            const hrefs = nodes(doc, D, "href").map((n) => n.textContent);
            if (hrefs.length > 2000)
              throw new CalendarError(413, "Trop de ressources.");
            for (const href of hrefs) {
              let target;
              try {
                target = decodeURIComponent(
                  new URL(href, "https://local.invalid").pathname,
                );
              } catch {
                throw new CalendarError(400, "Chemin invalide.");
              }
              const rid =
                  target.startsWith(collection) && target.endsWith(".ics")
                    ? target.slice(collection.length, -4)
                    : null,
                row = rid && validId(rid) ? await store.get(uid, rid) : null;
              if (row) rows.push(row);
              else
                missing.push(
                  `<d:response><d:href>${escape(href)}</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`,
                );
            }
          } else if (
            root.namespaceURI === C &&
            root.localName === "calendar-query"
          ) {
            if (
              nodes(doc, C, "prop-filter").length ||
              nodes(doc, C, "expand").length
            )
              throw new CalendarError(
                403,
                "Ce filtre n’est pas pris en charge.",
              );
            const components = nodes(doc, C, "comp-filter");
            if (
              components.some(
                (n) =>
                  !["VCALENDAR", "VEVENT", "VALARM"].includes(
                    n.getAttribute("name"),
                  ),
              )
            )
              return multi(res, []);
            rows = await store.list(uid);
            const range = nodes(doc, C, "time-range")[0];
            if (range) {
              const parse = (value) => (value ? ICALDate(value) : null),
                start = parse(range.getAttribute("start")),
                end = parse(range.getAttribute("end"));
              rows = rows.filter(
                (r) =>
                  (!start || r.data.endAt > start) &&
                  (!end || r.data.startAt < end),
              );
            }
          } else throw new CalendarError(403, "Rapport non pris en charge.");
          return multi(
            res,
            [
              ...rows.map((row) =>
                row.deleted
                  ? `<d:response><d:href>${collection + escape(encodeURIComponent(row.id))}.ics</d:href><d:status>HTTP/1.1 404 Not Found</d:status></d:response>`
                  : eventResponse(row, doc, true),
              ),
              ...missing,
            ],
            tail,
          );
        }
        if (id && ["GET", "HEAD"].includes(req.method)) {
          const row = await store.get(uid, id);
          if (!row) return res.status(404).end();
          res.set("ETag", row.etag);
          if (req.get("If-None-Match") === row.etag)
            return res.status(304).end();
          return res.type("text/calendar").send(row.ical);
        }
        if (id && req.method === "PUT") {
          if (typeof req.body !== "string")
            throw new CalendarError(400, "Contenu iCalendar requis.");
          const { row, created } = await store.mutate(uid, id, req.body, {
            ics: true,
            match: req.get("If-Match"),
            createOnly: req.get("If-None-Match") === "*",
            requireMatch: true,
          });
          res.set("ETag", row.etag);
          return res.status(created ? 201 : 204).end();
        }
        if (id && req.method === "DELETE") {
          await store.mutate(uid, id, null, {
            remove: true,
            match: req.get("If-Match"),
            requireMatch: true,
          });
          return res.status(204).end();
        }
        if (req.method === "PROPPATCH") {
          const doc = document(req.body),
            props = doc ? nodes(doc, D, "prop") : [];
          return multi(res, [
            `<d:response><d:href>${escape(full)}</d:href><d:propstat><d:prop>${props
              .flatMap((p) =>
                Array.from(p.childNodes)
                  .filter((n) => n.nodeType === 1)
                  .map(
                    (n) =>
                      "<x:" +
                      n.localName +
                      ' xmlns:x="' +
                      escape(n.namespaceURI) +
                      '"/>',
                  ),
              )
              .join(
                "",
              )}</d:prop><d:status>HTTP/1.1 403 Forbidden</d:status></d:propstat></d:response>`,
          ]);
        }
        return res.status(405).end();
      } catch (e) {
        if (e instanceof CalendarError)
          return xml(
            res,
            e.status,
            `<d:error ${namespaces}><d:responsedescription>${escape(e.message)}</d:responsedescription></d:error>`,
          );
        next(e);
      }
    },
  );
}
function ICALDate(value) {
  if (!/^\d{8}T\d{6}Z$/.test(value))
    throw new CalendarError(400, "Intervalle invalide.");
  const v =
    value.slice(0, 4) +
    "-" +
    value.slice(4, 6) +
    "-" +
    value.slice(6, 8) +
    "T" +
    value.slice(9, 11) +
    ":" +
    value.slice(11, 13) +
    ":" +
    value.slice(13, 15) +
    "Z";
  if (!Number.isFinite(Date.parse(v)))
    throw new CalendarError(400, "Date invalide.");
  return new Date(v).toISOString();
}
