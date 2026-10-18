import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { CalendarView } from "./CalendarView";
import { AppleCalendarConnect } from "./AppleCalendarConnect";
import type { CalendarEvent, CalendarEvents } from "../lib/calendar";
type Request = (url: string, init?: RequestInit) => Promise<unknown>;
type ServerEvent = CalendarEvent & { startAt: string; endAt: string };
type Props = Omit<
  ComponentProps<typeof CalendarView>,
  "events" | "onSave" | "onDelete"
> & { request: Request; focusEventId?: string | null };
function wall(iso: string, zone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
}
export function CalendarWorkspace({ request, focusEventId, ...props }: Props) {
  const latest = useRef(request),
    [events, setEvents] = useState<CalendarEvents>({}),
    [loaded, setLoaded] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [updated, setUpdated] = useState("");
  useEffect(() => {
    latest.current = request;
  }, [request]);
  const loadSequence = useRef(0);
  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    const data = (await latest.current("/api/calendar")) as {
      events: ServerEvent[];
      updatedAt: string;
    };
    if (sequence !== loadSequence.current) return;
    setEvents(
      Object.fromEntries(
        data.events.map((e) => [
          e.id,
          {
            ...e,
            start: wall(e.startAt, props.timeZone),
            end: wall(e.endAt, props.timeZone),
            timeZone: props.timeZone,
          },
        ]),
      ),
    );
    setUpdated(data.updatedAt);
    setLoaded(true);
  }, [props.timeZone]);
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (document.hidden) return;
      void load().catch((e) => {
        if (alive) setError((e as Error).message);
      });
    };
    const timer = setTimeout(refresh, 0),
      poll = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  const save = async (event: CalendarEvent) => {
    setSaving(true);
    setError("");
    try {
      const response = (await latest.current(
        "/api/calendar/events/" + encodeURIComponent(event.id),
        {
          method: "PUT",
          headers: event.etag
            ? { "If-Match": event.etag }
            : { "If-None-Match": "*" },
          body: JSON.stringify(event),
        },
      )) as { event: ServerEvent };
      loadSequence.current++;
      const saved = response.event;
      setEvents((old) => ({
        ...old,
        [saved.id]: {
          ...saved,
          start: wall(saved.startAt, props.timeZone),
          end: wall(saved.endAt, props.timeZone),
          timeZone: props.timeZone,
        },
      }));
      setUpdated(new Date().toISOString());
      window.dispatchEvent(new Event("itemstracker-calendar-change"));
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
      throw e;
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: string) => {
    setSaving(true);
    setError("");
    try {
      await latest.current(
        "/api/calendar/events/" + encodeURIComponent(id) + "/delete",
        { method: "POST", headers: { "If-Match": events[id].etag || "" } },
      );
      loadSequence.current++;
      setEvents((old) => {
        const next = { ...old };
        delete next[id];
        return next;
      });
      setUpdated(new Date().toISOString());
      window.dispatchEvent(new Event("itemstracker-calendar-change"));
    } catch (e) {
      setError((e as Error).message);
      await load().catch(() => {});
      throw e;
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="calendar-workspace">
      {error ? (
        <div className="cal-service-error" role="alert">
          {error}
          <button
            onClick={() =>
              void load()
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Recharger le calendrier
          </button>
        </div>
      ) : null}
      <div className="cal-sync-status" role="status">
        {saving
          ? "Enregistrement…"
          : updated
            ? "Synchronisé à " +
              new Date(updated).toLocaleTimeString("fr-FR", {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Chargement du calendrier…"}
      </div>
      {loaded ? (
        <CalendarView
          {...props}
          focusDate={
            focusEventId ? events[focusEventId]?.start.slice(0, 10) : undefined
          }
          events={events}
          onSave={save}
          onDelete={remove}
          busy={saving}
        />
      ) : null}
      <AppleCalendarConnect request={request} timeZone={props.timeZone} />
    </div>
  );
}
