import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { CalendarView } from "./CalendarView";
import type { CalendarEvent, CalendarEvents } from "../lib/calendar";
type Request = (url: string, init?: RequestInit) => Promise<unknown>;
type Device = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
};
type ServerEvent = CalendarEvent & { startAt: string; endAt: string };
type Credentials = {
  id: string;
  password: string;
  username: string;
  server: string;
  calendarUrl: string;
};
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
    [updated, setUpdated] = useState(""),
    [devices, setDevices] = useState<Device[]>([]),
    [credentials, setCredentials] = useState<Credentials | null>(null),
    [label, setLabel] = useState("Mon iPhone"),
    [connecting, setConnecting] = useState(false);
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
  const loadDevices = async () => {
    const data = (await latest.current("/api/calendar/devices")) as {
      devices: Device[];
    };
    setDevices(data.devices);
  };
  const connect = async () => {
    setConnecting(true);
    setError("");
    try {
      setCredentials(
        (await latest.current("/api/calendar/devices", {
          method: "POST",
          body: JSON.stringify({ label, timeZone: props.timeZone }),
        })) as Credentials,
      );
      await loadDevices();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setConnecting(false);
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
      <details
        className="cal-apple"
        onToggle={(e) => {
          if (e.currentTarget.open)
            void loadDevices().catch((e) => setError(e.message));
        }}
      >
        <summary>Connecter Apple Calendrier</summary>
        <p>
          Ajoute le compte ItemsTracker sur chaque appareil. Les séances créées
          ou modifiées dans Apple et dans ItemsTracker utilisent le même
          calendrier. Aucun accès à ton compte iCloud personnel.
        </p>
        <label>
          Nom de l’appareil
          <input
            maxLength={80}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <button
          disabled={connecting || !label.trim()}
          onClick={() => void connect()}
        >
          Créer les identifiants de cet appareil
        </button>
        {credentials ? (
          <section className="cal-credentials">
            <strong>Identifiants affichés une seule fois</strong>
            <p>
              Dans les réglages de Calendrier sur iPhone/iPad : Comptes →
              Ajouter un compte → Autre → Ajouter un compte CalDAV. Sur Mac :
              Calendrier → Ajouter un compte → Autre compte CalDAV → Manuel.
              Active SSL.
            </p>
            <label>
              Serveur
              <input readOnly value={credentials.server} />
            </label>
            <label>
              Nom d’utilisateur
              <input readOnly value={credentials.username} />
            </label>
            <label>
              Mot de passe dédié
              <input
                readOnly
                type="text"
                autoComplete="off"
                value={credentials.password}
              />
            </label>
            <small>
              Si nécessaire, utilise cette URL dans les réglages avancés :{" "}
              {credentials.calendarUrl}
            </small>
            <p>
              La fréquence de mise à jour dépend des réglages d’Apple
              Calendrier. Les rappels Apple nécessitent ses notifications
              activées.
            </p>
            <button onClick={() => setCredentials(null)}>
              J’ai enregistré les identifiants
            </button>
          </section>
        ) : null}
        <h3>Appareils autorisés</h3>
        {!devices.length ? (
          <p>Aucun appareil connecté.</p>
        ) : (
          devices.map((d) => (
            <div className="cal-device" key={d.id}>
              <span>
                <strong>{d.label}</strong>
                <small>
                  {d.last_used_at
                    ? "Dernier accès : " +
                      new Date(d.last_used_at).toLocaleString("fr-FR")
                    : "Pas encore utilisé"}
                </small>
              </span>
              <button
                disabled={connecting}
                onClick={() => {
                  if (
                    !window.confirm(
                      "Révoquer cet appareil ? Les séances seront conservées.",
                    )
                  )
                    return;
                  setConnecting(true);
                  void latest
                    .current("/api/calendar/devices/" + d.id + "/revoke", {
                      method: "POST",
                    })
                    .then(async () => {
                      if (credentials?.id === d.id) setCredentials(null);
                      await loadDevices();
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setConnecting(false));
                }}
              >
                Révoquer
              </button>
            </div>
          ))
        )}
      </details>
    </div>
  );
}
