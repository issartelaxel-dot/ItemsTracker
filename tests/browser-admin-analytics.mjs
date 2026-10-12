// Real local PostgreSQL/API, fictional fixtures, no production account or service.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import express from "express";
import { chromium, webkit, expect } from "@playwright/test";
import { createAnalyticsStore } from "../server/analytics-store.mjs";
import { mountAnalytics } from "../server/analytics.mjs";
import {
  initAnnouncements,
  mountAnnouncements,
} from "../server/announcements.mjs";
const socket = net.createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const pgPort = socket.address().port;
await new Promise((r) => socket.close(r));
const dir = await mkdtemp(path.join(os.tmpdir(), "items-admin-ui-")),
  out =
    process.env.ADMIN_QA_OUTPUT ||
    path.join(os.tmpdir(), "itemstracker-admin-qa");
fs.mkdirSync(out, { recursive: true });
const cluster = new EmbeddedPostgres({
  databaseDir: path.join(dir, "pg"),
  port: pgPort,
  user: "postgres",
  password: "test-only",
  persistent: false,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
let pool, server;
try {
  await cluster.initialise();
  await cluster.start();
  pool = new pg.Pool({
    connectionString: `postgresql://postgres:test-only@127.0.0.1:${pgPort}/postgres`,
  });
  await pool.query(
    "CREATE TABLE users(id BIGSERIAL PRIMARY KEY,email TEXT NOT NULL,created_at TEXT NOT NULL);INSERT INTO users(email,created_at) VALUES('hello@setup-hub.com',NOW()::text)",
  );
  await pool.query(
    "INSERT INTO users(email,created_at) SELECT 'private-'||i||'@test.invalid',(NOW()-(i||' days')::interval)::text FROM generate_series(1,24)i",
  );
  const store = createAnalyticsStore(pool);
  await store.init();
  await initAnnouncements(pool);
  const locations = [
    { country: "FR", city: "Paris", latitude: 48.9, longitude: 2.3 },
    { country: "FR", city: "Lyon", latitude: 45.8, longitude: 4.8 },
    { country: "BE", city: "Bruxelles", latitude: 50.8, longitude: 4.4 },
    { country: "US", city: "New York", latitude: 40.7, longitude: -74 },
  ];
  for (let i = 0; i < 70; i++) {
    const kind = i < 42 ? "user" : "visitor",
      uid = 2 + (i % 24),
      id = randomUUID(),
      visitorId = randomUUID(),
      place = locations[i % 4];
    await store.pulse(
      {
        kind,
        sessionId: id,
        ...(kind === "visitor" ? { visitorId } : {}),
        sequence: 0,
        active: i < 8,
        section: kind === "visitor" ? "sales" : "flashcards",
        sections: [
          {
            section: kind === "visitor" ? "sales" : "flashcards",
            seconds: 0,
            reviews: kind === "user" ? 3 + (i % 8) : 0,
            visits: 1,
          },
        ],
      },
      kind === "user" ? uid : null,
      place,
    );
    await pool.query(
      "UPDATE analytics_sessions SET started_at=NOW()-($2||' days')::interval,last_seen=CASE WHEN $2::int=0 THEN NOW() ELSE NOW()-($2||' days')::interval END WHERE id=$1",
      [id, i < 8 ? 0 : i % 28],
    );
    await pool.query(
      "UPDATE analytics_session_sections SET active_seconds=$2 WHERE session_id=$1",
      [id, 300 + i * 20],
    );
  }
  const app = express();
  app.use(express.json());
  const auth = (req) =>
      req.get("authorization") === "Bearer admin-test"
        ? { uid: 1 }
        : req.get("authorization") === "Bearer user-test"
          ? { uid: 2 }
          : null,
    limiter = (_req, _res, next) => next();
  mountAnalytics(app, {
    store,
    pool,
    authenticate: auth,
    adminEmails: ["hello@setup-hub.com"],
    limiter,
    geo: {
      lookup: () => null,
      status: () => ({
        ready: true,
        provider: "DB-IP Lite",
        attribution: "https://db-ip.com",
      }),
    },
  });
  mountAnnouncements(app, {
    pool,
    authenticate: auth,
    adminEmails: ["hello@setup-hub.com"],
    limiter,
  });
  app.use(
    "/itemstracker",
    express.static(process.env.ADMIN_TEST_DIST || "dist", {
      index: "index.html",
    }),
  );
  app.use((e, _req, res, _next) => res.status(500).json({ error: e.message }));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}`,
    results = [];
  for (const engine of ["Chrome", "WebKit"]) {
    const browser = await (engine === "Chrome" ? chromium : webkit).launch(
      engine === "Chrome"
        ? {
            executablePath:
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          }
        : {},
    );
    for (const width of [320, 390, 820, 1440]) {
      const context = await browser.newContext({
          viewport: { width, height: width < 768 ? 844 : 1000 },
          hasTouch: width < 768,
          userAgent:
            "Mozilla/5.0 AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await context.addInitScript(
        () =>
          localStorage.getItem("med_auth_token") ||
          localStorage.setItem("med_auth_token", "admin-test"),
      );
      await page.route("https://api.setup-hub.com/**", async (route) => {
        const req = route.request(),
          url = new URL(req.url()),
          response = await fetch(base + url.pathname + url.search, {
            method: req.method(),
            headers: {
              "content-type": "application/json",
              authorization: req.headers().authorization || "",
            },
            ...(req.postData() ? { body: req.postData() } : {}),
          });
        await route.fulfill({
          status: response.status,
          contentType: "application/json",
          body: await response.text(),
        });
      });
      await page.goto(base + "/itemstracker/admin-app.html");
      await expect(page.locator(".admin-kpis")).toBeVisible();
      assert.equal(await page.locator(".admin-kpis article").count(), 4);
      await expect(
        page.locator(".admin-kpi").first().getByText("25", { exact: true }),
      ).toBeVisible();
      await expect(
        page.locator(".admin-globe > g > circle").first(),
      ).toBeVisible();
      assert.ok((await page.locator(".admin-globe circle").count()) > 900);
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "Page should not overflow",
      );
      await page.screenshot({
        path: `${out}/${engine}-${width}-overview.png`,
        fullPage: true,
      });
      const circle = page.locator(".admin-globe > g > circle").first(),
        initial = await circle.getAttribute("r");
      await page.getByRole("button", { name: "Zoomer", exact: true }).click();
      assert.notEqual(await circle.getAttribute("r"), initial);
      await page
        .getByRole("button", { name: "Recentrer", exact: true })
        .click();
      const land = page.locator(".admin-globe > g > circle").nth(1),
        x = await land.getAttribute("cx"),
        box = await page.locator(".admin-globe").boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width * 0.7,
        box.y + box.height * 0.55,
        { steps: 8 },
      );
      await page.mouse.up();
      assert.notEqual(await land.getAttribute("cx"), x);
      await page
        .getByRole("button", { name: "Recentrer", exact: true })
        .click();
      const marker = page
        .locator('.admin-globe [data-location="FR:Paris"] circle')
        .last();
      await marker.click({ force: true });
      await expect(page.locator(".admin-filter-banner")).toBeVisible();
      await page.getByRole("button", { name: "Effacer le filtre" }).click();
      await page.getByLabel("Filtrer par pays").selectOption("US");
      await expect(page.locator(".admin-filter-banner")).toContainText(
        "États-Unis",
      );
      await page.getByRole("button", { name: "Effacer le filtre" }).click();
      await page
        .locator(".admin-location-list button")
        .filter({ hasText: "Paris" })
        .click();
      await expect(page.locator(".admin-filter-banner")).toContainText("Paris");
      await expect(page.locator(".admin-entities")).not.toContainText(
        "New York",
      );
      await page.getByRole("button", { name: "Effacer le filtre" }).click();
      await page.getByLabel("Période des statistiques").selectOption("7");
      await expect(page.locator(".admin-kpi").nth(1)).toContainText("7 jours");
      await page
        .getByRole("button", { name: "Utilisateurs", exact: true })
        .click();
      await expect(page.locator(".admin-entities footer")).toContainText(
        "25 identifiants",
      );
      await page.locator(".admin-entity-link").first().click();
      await expect(page.locator(".admin-detail-dialog")).toBeVisible();
      await expect(page.locator(".admin-detail-dialog")).not.toContainText(
        "@test.invalid",
      );
      await page.getByRole("button", { name: "Fermer la fiche" }).click();
      await expect(page.locator(".admin-detail-dialog")).toHaveCount(0);
      await page.getByRole("button", { name: "Annonces", exact: true }).click();
      await expect(page.locator(".ann-admin-embedded")).toBeVisible();
      await page
        .getByLabel("Titre", { exact: true })
        .fill(`Annonce ${engine} ${width}`);
      await page.getByLabel("Résumé dans la cloche").fill("Nouveau calendrier");
      await page
        .getByLabel("Patchnotes détaillées")
        .fill("Détails de publication\nDeuxième ligne");
      await page
        .getByRole("button", { name: "Enregistrer le brouillon" })
        .click();
      await expect(page.getByRole("status")).toContainText(
        "Brouillon enregistré",
      );
      await page.getByRole("button", { name: "Aperçu", exact: true }).click();
      await expect(page.locator(".ann-preview")).toContainText(
        "Nouveau calendrier",
      );
      page.once("dialog", (d) => d.accept());
      await page
        .locator(".ann-record")
        .filter({ hasText: `Annonce ${engine} ${width}` })
        .getByRole("button", { name: "Publier", exact: true })
        .click();
      await expect(page.getByRole("status")).toContainText("Annonce publiée");
      const live = await fetch(base + "/api/announcements", {
        headers: { authorization: "Bearer user-test" },
      });
      assert.ok(
        (await live.json()).announcements.some(
          (a) => a.title === `Annonce ${engine} ${width}`,
        ),
      );
      await page.screenshot({
        path: `${out}/${engine}-${width}-announcements.png`,
        fullPage: true,
      });
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Vue d’ensemble", exact: true })
        .click();
      await page.getByRole("button", { name: "Exporter la vue" }).click();
      assert.ok((await download).suggestedFilename().endsWith(".csv"));
      await page.evaluate(() =>
        localStorage.setItem("med_auth_token", "user-test"),
      );
      await page.reload();
      await expect(page.getByRole("alert")).toContainText("Accès réservé");
      await expect(page.locator(".admin-kpis")).toHaveCount(0);
      await expect(page.locator(".ann-admin-embedded")).toHaveCount(0);
      assert.deepEqual(errors, []);
      results.push({
        engine,
        width,
        globe: true,
        geoFilters: true,
        detail: true,
        announcements: true,
        authorization: true,
        overflow: false,
      });
      await context.close();
    }
    await browser.close();
  }
  fs.writeFileSync(out + "/report.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ cases: results.length, output: out }));
} finally {
  if (server) await new Promise((r) => server.close(r));
  await pool?.end();
  await cluster.stop();
  await rm(dir, { recursive: true, force: true });
}
