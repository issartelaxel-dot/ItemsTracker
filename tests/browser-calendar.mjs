// Calendar workflow regression tests. All API and provider calls are mocked; no real account is modified.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { spawn } from "node:child_process";
const socket = net.createServer();
await new Promise((resolve) => socket.listen(0, "127.0.0.1", resolve));
const port = socket.address().port;
await new Promise((resolve) => socket.close(resolve));
import { chromium, webkit, expect } from "@playwright/test";
import { mergePatch } from "../server/state-model.mjs";

const base = `http://127.0.0.1:${port}`,
  out =
    process.env.CALENDAR_QA_OUTPUT ||
    path.join(os.tmpdir(), "itemstracker-calendar-qa");
fs.mkdirSync(out + "/captures", { recursive: true });
async function setup(browser, width = 390, height = 844, fixture = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: width < 768,
    hasTouch: width < 768,
  });
  const page = await context.newPage(),
    errors = [],
    saves = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let state = {
      trackingState: {
        items: {
          1: {
            assignedColleges: ["MÉDECINE INTERNE"],
            youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            usefulLinkUrl: "https://example.com/article",
            quiz: {
              enabled: true,
              activeCardId: "test-card-1",
              cards: [1, 2, 3].map((i) => ({
                id: "test-card-" + i,
                question:
                  "<p>Question " +
                  i +
                  " : Comment conserver une révision lisible sur un téléphone ?</p>",
                answer:
                  "<p>Réponse " +
                  i +
                  " : Le contenu reste accessible, avec des boutons tactiles et une navigation claire.</p>",
                quizCount: 0,
                lastReviewedAt: null,
                lastResult: null,
              })),
            },
          },
        },
      },
      theme: "light",
      focusMode: false,
      dateFormat: "fr-short",
      timeZone: "auto",
      youtubeDisplayMode: "embed",
      shuffleQuizCards: false,
      profile: {
        firstName: "Test",
        lastName: "Local",
        email: "test@example.test",
        photoUrl: "",
        password: "",
        avatarGradient: "red",
      },
    },
    version = 1;
  state = { ...state, ...fixture };
  await context.route("**/api/**", async (route) => {
    const req = route.request(),
      p = new URL(req.url()).pathname;
    const headers = {
      "content-type": "application/json",
      "x-app-version": "0.1.0",
      "access-control-allow-origin": base,
      "access-control-allow-credentials": "true",
      "access-control-expose-headers": "x-app-version",
      "access-control-allow-headers":
        "content-type,authorization,x-client-version",
      "access-control-allow-methods": "GET,PUT,PATCH,POST",
    };
    const answer = (body) =>
      route.fulfill({ headers, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    if (p === "/api/auth/me")
      return answer({
        user: {
          id: 123,
          email: "test@example.test",
          displayName: "Test Local",
        },
        token: "test-token",
      });
    if (p === "/api/state" && req.method() === "GET")
      return answer({
        state: { ...state, updatedAt: new Date().toISOString() },
        version,
        imageVersions: {},
      });
    if (p === "/api/state" && ["PATCH", "PUT"].includes(req.method())) {
      const b = req.postDataJSON();
      saves.push(b);
      state = req.method() === "PATCH" ? mergePatch(state, b.patch) : b;
      return answer({
        ok: true,
        version: ++version,
        updatedAt: new Date().toISOString(),
      });
    }
    if (p === "/api/quiz/generate-mcq")
      return answer({
        distractors: [
          { text: "Proposition A" },
          { text: "Proposition B" },
          { text: "Proposition C" },
        ],
        explanation: "Correction de test.",
      });
    if (p === "/api/resources/preview") return answer({ preview: null });
    return answer({ ok: true, token: "test-token", version });
  });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ||
    route.request().url().includes("/api/")
      ? route.fallback()
      : route.abort(),
  );
  await page.goto(base + "/itemstracker/app.html");
  await expect(page.locator(".dashboard-home")).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(400);
  return { context, page, errors, saves, getState: () => state };
}
async function dimensions(page) {
  return page.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    overflow: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const r = el.getBoundingClientRect(),
          s = getComputedStyle(el);
        return (
          r.width > 0 &&
          s.display !== "none" &&
          (r.right > innerWidth + 1 || r.left < -1)
        );
      })
      .slice(0, 12)
      .map((el) => ({
        class: el.className,
        text: el.textContent.slice(0, 60),
        rect: el.getBoundingClientRect().toJSON(),
      })),
  }));
}

const server = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: "ignore" },
);
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(base + "/itemstracker/app.html")).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  const results = [];
  for (const [name, engine] of [
    ["chrome", chromium],
    ["webkit", webkit],
  ]) {
    const browser = await engine.launch({
      headless: true,
      ...(name === "chrome"
        ? {
            executablePath:
              "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          }
        : {}),
    });
    try {
      for (const [width, height] of [
        [320, 568],
        [390, 844],
        [430, 932],
        [820, 1180],
        [1440, 1000],
      ]) {
        const t = await setup(browser, width, height),
          { page, context } = t;
        let events = {},
          devices = [],
          version = 1,
          stale = false,
          reads = [];
        await context.route("**/api/calendar**", async (route) => {
          const req = route.request(),
            url = new URL(req.url()),
            body = req.postDataJSON(),
            headers = req.headers();
          const reply = (value, status = 200) =>
            route.fulfill({
              status,
              contentType: "application/json",
              body: JSON.stringify(value),
            });
          if (url.pathname === "/api/calendar")
            return reply({
              events: Object.values(events),
              updatedAt: new Date().toISOString(),
            });
          if (url.pathname === "/api/calendar/reminders")
            return reply({
              reminders: Object.values(events)
                .filter((e) => !e.completed && e.reminderMinutes !== null)
                .map((e) => ({
                  id: e.id,
                  title: e.title,
                  startAt: e.startAt,
                  read_at: reads.includes(e.id)
                    ? new Date().toISOString()
                    : null,
                })),
            });
          if (url.pathname === "/api/calendar/reminders/read") {
            reads.push(...body.ids);
            return reply({ ok: true });
          }
          if (
            url.pathname === "/api/calendar/devices" &&
            req.method() === "GET"
          )
            return reply({ devices });
          if (url.pathname === "/api/calendar/devices") {
            const id = String(version++);
            devices.push({
              id,
              label: body.label,
              created_at: new Date().toISOString(),
              last_used_at: null,
            });
            return reply(
              {
                id,
                username: "test@example.test",
                password: "device-test-only",
                server: base + "/dav/",
                calendarUrl: base + "/dav/calendars/123/itemstracker/",
              },
              201,
            );
          }
          if (url.pathname.endsWith("/revoke")) {
            devices = devices.filter(
              (d) => !url.pathname.includes("/" + d.id + "/"),
            );
            return reply({ ok: true });
          }
          const id = url.pathname.split("/")[4];
          if (req.method() === "PUT") {
            if (stale) {
              stale = false;
              events[id] = {
                ...events[id],
                title: "Autre appareil",
                etag: '"new-version"',
              };
              return reply(
                { error: "Cette séance a été modifiée sur un autre appareil." },
                412,
              );
            }
            if (events[id] && headers["if-match"] !== events[id].etag)
              return reply({ error: "Conflit." }, 412);
            const normalized = (
              await import("../server/calendar-model.mjs")
            ).normalizeEvent(body);
            events[id] = { ...normalized, etag: '"' + version++ + '"' };
            return reply({ event: events[id] });
          }
          if (url.pathname.endsWith("/delete")) {
            delete events[id];
            return reply({ ok: true });
          }
          return reply({ ok: true });
        });
        const nav = page.locator(
          width < 768 ? ".mobile-bottom-nav" : ".sidebar-nav",
        );
        await nav
          .getByRole("button", { name: "Calendrier", exact: true })
          .click();
        const workspace = page.locator(".calendar-workspace"),
          dialog = page.locator(".cal-dialog");
        await expect(workspace.locator("h1")).toHaveText("Calendrier");
        await expect(workspace.locator(".cal-day")).toHaveCount(42);
        assert.ok(
          (await dimensions(page)).scrollWidth <= width + 1,
          "No calendar page overflow",
        );
        if (width < 768) {
          await expect(nav.getByRole("button")).toHaveCount(5);
          await page
            .getByRole("button", {
              name: "Mon profil et réglages",
              exact: true,
            })
            .click();
          await expect(
            page.getByRole("dialog", { name: "Mon profil", exact: true }),
          ).toBeVisible();
          await page
            .getByRole("dialog", { name: "Mon profil" })
            .getByRole("button", { name: /Fermer/ })
            .click();
        }
        await workspace.getByRole("button", { name: "Mois suivant" }).click();
        await workspace.getByRole("button", { name: "Mois précédent" }).click();
        await workspace
          .getByRole("button", { name: "Planifier", exact: true })
          .click();
        await expect(dialog).toBeVisible();
        await dialog
          .getByLabel("Titre", { exact: true })
          .fill(
            "Révision cœur et médecine — séance suffisamment longue pour vérifier le retour à la ligne",
          );
        await dialog
          .getByLabel("Rechercher un contenu à associer")
          .fill("#1 ·");
        await dialog
          .locator(".cal-picker-results input[type=checkbox]")
          .first()
          .check();
        await dialog
          .getByLabel("Rappel (Apple et cloche ItemsTracker)")
          .selectOption("15");
        const start = await dialog
          .getByLabel("Début", { exact: true })
          .inputValue();
        assert.ok(
          await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
          "No editor overflow",
        );
        await dialog
          .getByRole("button", { name: "Enregistrer", exact: true })
          .click();
        await expect(dialog).not.toBeVisible();
        await expect(workspace.locator(".cal-event")).toHaveCount(1);
        const first = Object.values(events)[0];
        assert.deepEqual(first.itemNumbers, [1]);
        assert.equal(first.reminderMinutes, 15);
        assert.equal(first.start, start);
        await workspace
          .locator(".cal-event")
          .getByRole("button", { name: "Terminer", exact: true })
          .click();
        await expect(workspace.locator(".cal-event")).toHaveClass(/done/);
        assert.equal(events[first.id].completed, true);
        await workspace
          .getByRole("button", { name: "Rouvrir", exact: true })
          .click();
        await expect(workspace.locator(".cal-event")).not.toHaveClass(/done/);
        await workspace
          .getByRole("button", { name: "Commencer", exact: true })
          .click();
        await expect(
          page.getByRole("dialog", { name: "Révision", exact: true }),
        ).toBeVisible();
        await page
          .getByRole("dialog", { name: "Révision" })
          .getByRole("button", { name: "Quitter", exact: true })
          .click();
        assert.equal(events[first.id].completed, false);
        await workspace
          .getByRole("button", { name: "Dupliquer", exact: true })
          .click();
        await dialog
          .getByLabel("Titre", { exact: true })
          .fill("Examen de test");
        await dialog.getByLabel("Type", { exact: true }).selectOption("exam");
        await dialog
          .getByRole("button", { name: "Enregistrer", exact: true })
          .click();
        await expect(workspace.locator(".cal-event")).toHaveCount(2);
        await workspace
          .locator(".cal-event.exam")
          .getByRole("button", { name: "Déplacer / modifier" })
          .click();
        stale = true;
        await dialog
          .getByLabel("Titre", { exact: true })
          .fill("Brouillon conservé");
        await dialog
          .getByRole("button", { name: "Enregistrer", exact: true })
          .click();
        await expect(dialog.getByRole("alert")).toContainText("autre appareil");
        await expect(dialog.getByLabel("Titre", { exact: true })).toHaveValue(
          "Brouillon conservé",
        );
        await dialog
          .getByRole("button", { name: "Conserver ma version comme copie" })
          .click();
        await dialog
          .getByRole("button", { name: "Enregistrer", exact: true })
          .click();
        await expect(workspace.locator(".cal-event")).toHaveCount(3);
        page.once("dialog", (d) => d.accept());
        await workspace
          .locator(".cal-event.exam")
          .last()
          .getByRole("button", { name: "Déplacer / modifier" })
          .click();
        await dialog
          .getByRole("button", { name: "Supprimer", exact: true })
          .click();
        await expect(workspace.locator(".cal-event")).toHaveCount(2);
        if (width === 1440) {
          const from = workspace.locator(".cal-mini-event.revision").first(),
            target = workspace.locator(".cal-day:not(.outside)").nth(20),
            date = await target
              .locator(".cal-day-select")
              .getAttribute("aria-label");
          await from.dragTo(target);
          await expect
            .poll(() => events[first.id].start.slice(0, 10))
            .toBe(date.split(",")[0]);
        }
        await workspace.getByRole('button', { name: 'Connecter Apple Calendrier', exact: true }).click();
        const appleDialog = page.getByRole('dialog', { name: 'Sur quel appareil veux-tu te connecter ?' });
        await appleDialog.getByRole('button', { name: 'Créer ma connexion', exact: true }).click();
        const setupDialog = page.locator('.apple-setup-dialog');
        await expect(setupDialog.getByLabel('Mot de passe dédié', {exact:true})).toHaveValue('device-test-only');
        await setupDialog.getByRole('button', { name: 'J’ai ajouté le compte dans Apple Calendrier', exact: true }).click();
        await expect(setupDialog.getByLabel('Mot de passe dédié', {exact:true})).toHaveCount(0);
        await setupDialog.getByRole('button', { name: 'Voir mes appareils', exact: true }).click();
        await setupDialog.getByRole('button', { name: 'Retirer', exact: true }).click();
        await setupDialog.getByRole('button', { name: 'Confirmer le retrait', exact: true }).click();
        await expect(setupDialog.locator('.apple-setup-devices > li')).toHaveCount(0);
        await setupDialog.getByRole('button', { name: 'Fermer la connexion Apple Calendrier', exact: true }).click();
        await page
          .locator(".dashboard-content")
          .evaluate((el) => (el.scrollTop = 0));
        await page.screenshot({
          path: out + "/captures/calendar-" + name + "-" + width + ".png",
          fullPage: true,
        });
        const bell = page.locator(".ann-bell:visible").first();
        await bell.getByRole("button").first().click();
        const reminder = bell
          .locator(".ann-entry")
          .filter({ hasText: "Voir dans le calendrier" })
          .first();
        await expect(reminder).toBeVisible();
        assert.deepEqual(reads, []);
        await reminder.click();
        await expect.poll(() => reads.length).toBe(1);
        await expect(workspace.locator(".cal-event.revision")).toHaveCount(1);
        if (width < 768) {
          await page
            .getByRole("button", {
              name: "Mon profil et réglages",
              exact: true,
            })
            .click();
          await page
            .getByRole("button", {
              name: "Activer le thème sombre",
              exact: true,
            })
            .click();
          await page
            .getByRole("dialog", { name: "Mon profil" })
            .getByRole("button", { name: /Fermer/ })
            .click();
        } else
          await page
            .getByRole("button", {
              name: "Activer le thème sombre",
              exact: true,
            })
            .click();
        await expect(page.locator("html")).toHaveAttribute(
          "data-theme",
          "dark",
        );
        await page
          .locator(".dashboard-content")
          .evaluate((el) => (el.scrollTop = 0));
        await page.screenshot({
          path: out + "/captures/calendar-" + name + "-" + width + "-dark.png",
          fullPage: true,
        });
        assert.ok(
          (await dimensions(page)).scrollWidth <= width + 1,
          "No overflow after long event title",
        );
        await page.reload();
        await expect(page.locator(".dashboard-home")).toBeVisible();
        await nav
          .getByRole("button", { name: "Calendrier", exact: true })
          .click();
        await expect(workspace.locator("h1")).toHaveText("Calendrier");
        assert.equal(Object.keys(events).length, 2);
        if(width<768){
        const from=await nav.getByRole('button',{name:'Calendrier',exact:true}).boundingBox(),to=await nav.getByRole('button',{name:'Items',exact:true}).boundingBox()
        await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up()
        await expect(page.locator('#items-section')).toBeVisible()
        const profile=page.getByRole('button',{name:'Mon profil et réglages',exact:true});await profile.click();await page.getByRole('dialog',{name:'Mon profil'}).getByRole('button',{name:/Fermer/}).click();await expect(profile).toBeFocused()
        assert.ok((await dimensions(page)).scrollWidth<=width+1,'Items header fits with the profile shortcut')
      }
      assert.deepEqual(t.errors, []);
        results.push({ browser: name, width, height, pass: true });
        console.log(name, width, "PASS");
        await context.close();
      }
    } finally {
      await browser.close();
    }
  }
  fs.writeFileSync(
    out + "/validation-calendar.json",
    JSON.stringify(results, null, 2),
  );
} finally {
  server.kill("SIGTERM");
}
