export type CalendarEvent = {
  id: string;
  title: string;
  kind: "revision" | "exam";
  activity: "items" | "flashcards";
  start: string;
  end: string;
  timeZone: string;
  notes: string;
  itemNumbers: number[];
  colleges: string[];
  cardKeys: string[];
  completed: boolean;
  reminderMinutes: number | null;
  etag?: string;
};
export type CalendarEvents = Record<string, CalendarEvent>;
export function dateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function monthDays(month: string) {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(year, m - 1, 1, 12),
    offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) =>
    dateKey(new Date(year, m - 1, 1 - offset + i, 12)),
  );
}
export function eventsOnDay(events: CalendarEvents, day: string) {
  // Half-open intervals: an event ending at midnight belongs to the previous day.
  return Object.values(events)
    .filter((e) => e.start < day + "T24:00" && e.end > day + "T00:00")
    .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}
export function validateCalendarEvent(event: CalendarEvent) {
  if (!event.title.trim()) return "Donne un titre à la séance.";
  const valid = (value: string) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) &&
    Number.isFinite(new Date(value).getTime());
  if (!valid(event.start) || !valid(event.end))
    return "Choisis une date et une heure de début et de fin.";
  if (event.end <= event.start) return "La fin doit être après le début.";
  return "";
}
export function overlappingEvents(
  events: CalendarEvents,
  event: CalendarEvent,
) {
  return Object.values(events).filter(
    (e) =>
      e.id !== event.id &&
      !e.completed &&
      e.start < event.end &&
      e.end > event.start,
  );
}

export function shiftEventDate(
  event: CalendarEvent,
  day: string,
): CalendarEvent {
  const offset =
    Date.parse(day + "T00:00Z") -
    Date.parse(event.start.slice(0, 10) + "T00:00Z");
  return {
    ...event,
    start: new Date(Date.parse(event.start + ":00Z") + offset)
      .toISOString()
      .slice(0, 16),
    end: new Date(Date.parse(event.end + ":00Z") + offset)
      .toISOString()
      .slice(0, 16),
  };
}
