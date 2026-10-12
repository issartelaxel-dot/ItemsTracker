import ICAL from "ical.js";
import { z } from "zod";
export class CalendarError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const wall = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
export const eventSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_.-]{1,120}$/),
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["revision", "exam"]),
  activity: z.enum(["items", "flashcards"]),
  start: wall,
  end: wall,
  timeZone: z.string().min(1).max(100),
  notes: z.string().max(4000),
  itemNumbers: z.array(z.number().int().min(1).max(9999)).max(400),
  colleges: z.array(z.string().max(200)).max(100),
  cardKeys: z.array(z.string().max(250)).max(10000),
  completed: z.boolean(),
  reminderMinutes: z.number().int().min(0).max(10080).nullable().default(null),
});
export function zonedWall(iso, zone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const p = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
export function wallToUTC(value, zone) {
  const raw = Date.parse(value + ":00Z");
  if (
    !Number.isFinite(raw) ||
    new Date(raw).toISOString().slice(0, 16) !== value ||
    value < "1900" ||
    value > "2200"
  )
    throw new CalendarError(400, "Date invalide.");
  try {
    let result = raw;
    for (let i = 0; i < 5; i++) {
      const shown = Date.parse(zonedWall(result, zone) + ":00Z");
      if (shown === raw) return new Date(result).toISOString();
      result += raw - shown;
    }
  } catch {
    throw new CalendarError(400, "Fuseau horaire invalide.");
  }
  throw new CalendarError(
    400,
    "Cet horaire n’existe pas lors du changement d’heure. Choisis un autre créneau.",
  );
}
export function normalizeEvent(input, previous = null) {
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success)
    throw new CalendarError(
      400,
      "Titre, dates, horaires ou contenus invalides.",
    );
  const data = parsed.data;
  try { new Intl.DateTimeFormat("en",{timeZone:data.timeZone}); } catch { throw new CalendarError(400,"Fuseau horaire invalide."); }
  // Preserve an unchanged instant, including the second occurrence of a DST hour.
  const instant = (key) =>
    previous && data[key] === zonedWall(previous[key + "At"], data.timeZone)
      ? previous[key + "At"]
      : wallToUTC(data[key], data.timeZone);
  const startAt = instant("start"),
    endAt = instant("end");
  if (endAt <= startAt)
    throw new CalendarError(400, "La fin doit être après le début.");
  return { ...data, startAt, endAt };
}
export function toICS(data, previous = null) {
  const root = previous
    ? new ICAL.Component(ICAL.parse(previous))
    : new ICAL.Component(["vcalendar", [], []]);
  root.updatePropertyWithValue("version", "2.0");
  root.updatePropertyWithValue("prodid", "-//ItemsTracker//Calendar//FR");
  let event = root.getFirstSubcomponent("vevent");
  if (!event) {
    event = new ICAL.Component("vevent");
    root.addSubcomponent(event);
    event.addPropertyWithValue("uid", data.id + "@itemstracker");
  }
  for (const [key, date] of [
    ["dtstart", data.startAt],
    ["dtend", data.endAt],
  ]) {
    event.removeAllProperties(key);
    event.addPropertyWithValue(key, ICAL.Time.fromJSDate(new Date(date), true));
  }
  event.removeAllProperties("duration");
  event.updatePropertyWithValue("summary", data.title);
  event.updatePropertyWithValue("description", data.notes);
  event.updatePropertyWithValue(
    "dtstamp",
    ICAL.Time.fromJSDate(new Date(), true),
  );
  event.updatePropertyWithValue(
    "last-modified",
    ICAL.Time.fromJSDate(new Date(), true),
  );
  event.updatePropertyWithValue(
    "sequence",
    Number(event.getFirstPropertyValue("sequence") || 0) + 1,
  );
  event.updatePropertyWithValue("x-itemstracker-kind", data.kind);
  event.removeAllSubcomponents("valarm");
  if (data.reminderMinutes !== null) {
    const alarm = new ICAL.Component("valarm");
    alarm.addPropertyWithValue("action", "DISPLAY");
    alarm.addPropertyWithValue("description", data.title);
    alarm.addPropertyWithValue(
      "trigger",
      ICAL.Duration.fromSeconds(-data.reminderMinutes * 60),
    );
    event.addSubcomponent(alarm);
  }
  return root.toString() + "\r\n";
}
export function fromICS(raw, id, previous = null, fallbackZone = "UTC") {
  let root, event;
  try {
    root = new ICAL.Component(ICAL.parse(raw));
    event = root.getFirstSubcomponent("vevent");
  } catch {
    throw new CalendarError(400, "Événement iCalendar invalide.");
  }
  if (
    root.name !== "vcalendar" ||
    root.getAllSubcomponents("vevent").length !== 1 ||
    !event ||
    !event.getFirstPropertyValue("uid")
  )
    throw new CalendarError(400, "Un événement avec identifiant est requis.");
  if (
    event.hasProperty("rrule") ||
    event.hasProperty("rdate") ||
    event.hasProperty("recurrence-id") ||
    event.hasProperty("attendee")
  )
    throw new CalendarError(
      403,
      "Les répétitions et invitations ne sont pas prises en charge. Crée une séance ponctuelle.",
    );
  const zone = previous?.timeZone || fallbackZone;
  const readTime = (key) => {
    const prop = event.getFirstProperty(key),
      time = prop?.getFirstValue();
    if (!time || time.isDate)
      throw new CalendarError(
        403,
        "Le début et la fin doivent comporter une heure.",
      );
    if (time.zone === ICAL.Timezone.utcTimezone || time.zone.tzid === "UTC")
      return time.toJSDate().toISOString();
    const tzid = prop.getParameter("tzid");
    if (tzid) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: tzid });
        return wallToUTC(time.toString().slice(0, 16), tzid);
      } catch (e) {
        if (e instanceof CalendarError) throw e;
      }
      if (time.zone && time.zone.tzid !== "floating" && time.zone.component)
        return time.toJSDate().toISOString();
      throw new CalendarError(400, "Fuseau iCalendar inconnu.");
    }
    return wallToUTC(time.toString().slice(0, 16), zone);
  };
  let startAt, endAt;
  try {
    startAt = readTime("dtstart");
    if (event.hasProperty("dtend")) endAt = readTime("dtend");
    else {
      const duration = event.getFirstPropertyValue("duration");
      if (!duration)
        throw new CalendarError(403, "Une heure de fin est requise.");
      endAt = new Date(
        Date.parse(startAt) + duration.toSeconds() * 1000,
      ).toISOString();
    }
  } catch (e) {
    if (e instanceof CalendarError) throw e;
    throw new CalendarError(400, "Dates iCalendar invalides.");
  }
  const alarms = event.getAllSubcomponents("valarm"),
    trigger = alarms
      .find((a) => a.getFirstPropertyValue("action") === "DISPLAY")
      ?.getFirstPropertyValue("trigger");
  let reminderMinutes = null;
  if (trigger && typeof trigger.toSeconds === "function")
    reminderMinutes = Math.max(0, -trigger.toSeconds() / 60);
  else if (trigger && typeof trigger.toJSDate === "function")
    reminderMinutes = Math.max(
      0,
      (Date.parse(startAt) - trigger.toJSDate().getTime()) / 60000,
    );
  const parsed = eventSchema.safeParse({
    id,
    title: String(event.getFirstPropertyValue("summary") || "Séance"),
    kind:
      previous?.kind ||
      (event.getFirstPropertyValue("x-itemstracker-kind") === "exam"
        ? "exam"
        : "revision"),
    activity: previous?.activity || "flashcards",
    notes: String(event.getFirstPropertyValue("description") || ""),
    start: zonedWall(startAt, zone),
    end: zonedWall(endAt, zone),
    timeZone: zone,
    itemNumbers: previous?.itemNumbers || [],
    colleges: previous?.colleges || [],
    cardKeys: previous?.cardKeys || [],
    completed: previous?.completed || false,
    reminderMinutes:
      reminderMinutes === null ? null : Math.round(reminderMinutes),
  });
  if (!parsed.success)
    throw new CalendarError(
      400,
      "Titre, horaires ou rappel iCalendar invalides.",
    );
  const data = parsed.data;
  // Retain the absolute times (including the second occurrence of a repeated DST hour).
  if (endAt <= startAt)
    throw new CalendarError(400, "La fin doit être après le début.");
  return {
    data: { ...data, startAt, endAt },
    uid: String(event.getFirstPropertyValue("uid")),
  };
}
