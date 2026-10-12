import { useEffect, useRef, useState } from "react";
import {
  Calendar,
  NavArrowLeft,
  NavArrowRight,
  Plus,
  Check,
  Xmark,
  Play,
} from "iconoir-react";
import {
  dateKey,
  shiftEventDate,
  eventsOnDay,
  monthDays,
  overlappingEvents,
  validateCalendarEvent,
  type CalendarEvent,
  type CalendarEvents,
} from "../lib/calendar";
import "./calendar.css";
type Option = { value: string; label: string };
type Props = {
  events: CalendarEvents;
  timeZone: string;
  items: Option[];
  colleges: Option[];
  cards: Option[];
  focusDate?: string;
  busy?: boolean;
  onSave: (event: CalendarEvent) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onStart: (event: CalendarEvent) => void;
  canStart: (event: CalendarEvent) => boolean;
};
export function CalendarView(p: Props) {
  const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: p.timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date()),
    [month, setMonth] = useState(today.slice(0, 7)),
    [selected, setSelected] = useState(today),
    [editing, setEditing] = useState<CalendarEvent | null>(null),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [pick, setPick] = useState<"items" | "colleges" | "cards">("items");
  useEffect(() => {
    if (!p.focusDate) return;
    const timer = setTimeout(() => {
      setSelected(p.focusDate!);
      setMonth(p.focusDate!.slice(0, 7));
    }, 0);
    return () => clearTimeout(timer);
  }, [p.focusDate]);
  const dialog = useRef<HTMLDialogElement>(null),
    opener = useRef<HTMLElement | null>(null);
  const edit = (event?: CalendarEvent) => {
    opener.current = document.activeElement as HTMLElement;
    setError("");
    setQuery("");
    setPick("items");
    setEditing(
      event
        ? {
            ...event,
            itemNumbers: [...event.itemNumbers],
            colleges: [...event.colleges],
            cardKeys: [...event.cardKeys],
          }
        : {
            id: crypto.randomUUID(),
            title: "",
            kind: "revision",
            activity: "flashcards",
            start: selected + "T09:00",
            end: selected + "T10:00",
            timeZone: p.timeZone,
            notes: "",
            itemNumbers: [],
            colleges: [],
            cardKeys: [],
            completed: false,
            reminderMinutes: null,
          },
    );
    dialog.current?.showModal();
  };
  const close = () => {
    dialog.current?.close();
    setEditing(null);
    opener.current?.focus();
  };
  const move = (delta: number) => {
    const [y, m] = month.split("-").map(Number);
    const key = dateKey(new Date(y, m - 1 + delta, 1, 12));
    setMonth(key.slice(0, 7));
    setSelected(key);
  };
  const list = eventsOnDay(p.events, selected),
    dayLabel = new Date(selected + "T12:00").toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  const options =
    pick === "items" ? p.items : pick === "colleges" ? p.colleges : p.cards;
  const matches = options.filter((o) =>
    o.label.toLocaleLowerCase("fr").includes(query.toLocaleLowerCase("fr")),
  );
  const values = editing
    ? pick === "items"
      ? editing.itemNumbers.map(String)
      : pick === "colleges"
        ? editing.colleges
        : editing.cardKeys
    : [];
  const toggle = (value: string) => {
    if (!editing) return;
    const next = values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
    setEditing({
      ...editing,
      ...(pick === "items"
        ? { itemNumbers: next.map(Number) }
        : pick === "colleges"
          ? { colleges: next }
          : { cardKeys: next }),
    });
  };
  const selectedOptions = editing
    ? [
        ...p.items
          .filter((o) => editing.itemNumbers.includes(Number(o.value)))
          .map((o) => ({ ...o, kind: "items" as const })),
        ...p.colleges
          .filter((o) => editing.colleges.includes(o.value))
          .map((o) => ({ ...o, kind: "colleges" as const })),
        ...p.cards
          .filter((o) => editing.cardKeys.includes(o.value))
          .map((o) => ({ ...o, kind: "cards" as const })),
      ]
    : [];
  return (
    <section className="calendar-view" aria-busy={p.busy}>
      <header className="cal-heading">
        <div>
          <h1>Calendrier</h1>
          <p>Organise tes révisions, à ton rythme.</p>
        </div>
        <button
          className="cal-primary"
          disabled={p.busy}
          onClick={() => edit()}
        >
          <Plus aria-hidden="true" />
          Planifier
        </button>
      </header>
      <div className="cal-layout">
        <section className="cal-month">
          <header className="cal-month-head">
            <div className="cal-month-nav">
              <button aria-label="Mois précédent" onClick={() => move(-1)}>
                <NavArrowLeft />
              </button>
              <h2>
                {new Date(month + "-01T12:00").toLocaleDateString("fr-FR", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
              <button aria-label="Mois suivant" onClick={() => move(1)}>
                <NavArrowRight />
              </button>
            </div>
            <button
              onClick={() => {
                setMonth(today.slice(0, 7));
                setSelected(today);
              }}
            >
              Aujourd’hui
            </button>
          </header>
          <div className="cal-weekdays" aria-hidden="true">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="cal-grid" role="grid" aria-label="Calendrier du mois">
            {monthDays(month).map((day) => {
              const events = eventsOnDay(p.events, day);
              return (
                <div
                  role="gridcell"
                  onDragOver={(e) => {
                    if (
                      e.dataTransfer.types.includes("text/itemstracker-event")
                    )
                      e.preventDefault();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const event =
                      p.events[
                        e.dataTransfer.getData("text/itemstracker-event")
                      ];
                    if (event && !p.busy)
                      void p.onSave(shiftEventDate(event, day)).catch(() => {});
                  }}
                  className={
                    "cal-day" +
                    (day.startsWith(month) ? "" : " outside") +
                    (day === selected ? " selected" : "") +
                    (day === today ? " today" : "")
                  }
                  key={day}
                >
                  <button
                    className="cal-day-select"
                    aria-label={
                      day +
                      (events.length
                        ? ", " + events.length + " événement(s)"
                        : "")
                    }
                    aria-pressed={day === selected}
                    onClick={() => {
                      setSelected(day);
                      if (!day.startsWith(month)) setMonth(day.slice(0, 7));
                    }}
                  >
                    <span>{Number(day.slice(-2))}</span>
                    <span className="cal-mobile-dots" aria-hidden="true">
                      {events.slice(0, 3).map((e) => (
                        <i
                          className={e.completed ? "done" : e.kind}
                          key={e.id}
                        />
                      ))}
                    </span>
                  </button>
                  <div className="cal-cell-events">
                    {events.slice(0, 2).map((e) => (
                      <button
                        draggable={!p.busy}
                        onDragStart={(ev) =>
                          ev.dataTransfer.setData(
                            "text/itemstracker-event",
                            e.id,
                          )
                        }
                        title={e.title}
                        key={e.id}
                        className={
                          "cal-mini-event " +
                          e.kind +
                          (e.completed ? " done" : "")
                        }
                        onClick={() => {
                          setSelected(day);
                          edit(e);
                        }}
                      >
                        {e.start.slice(11)} · {e.title}
                      </button>
                    ))}
                    {events.length > 2 ? (
                      <button
                        className="cal-more"
                        onClick={() => setSelected(day)}
                      >
                        +{events.length - 2} autres
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <footer className="cal-legend">
            <span>
              <i className="revision" />
              Révision
            </span>
            <span>
              <i className="exam" />
              Examen
            </span>
            <span>
              <i className="done" />
              Terminé
            </span>
          </footer>
        </section>
        <aside className="cal-agenda">
          <header>
            <h2>{dayLabel}</h2>
            <button
              aria-label="Ajouter une séance ce jour"
              onClick={() => edit()}
            >
              <Plus />
            </button>
          </header>
          <p className="cal-zone">Horaires : {p.timeZone}</p>
          {!list.length ? (
            <div className="cal-empty">
              <Calendar aria-hidden="true" />
              <p>Aucune séance prévue.</p>
              <button onClick={() => edit()}>Planifier une séance</button>
            </div>
          ) : (
            list.map((e) => (
              <article
                key={e.id}
                className={"cal-event " + e.kind + (e.completed ? " done" : "")}
              >
                <small>
                  {e.kind === "exam"
                    ? "Examen"
                    : e.activity === "items"
                      ? "Révision d’items"
                      : "Flashcards"}{" "}
                  · {e.completed ? "Terminé" : "À faire"}
                </small>
                <h3>
                  <button onClick={() => edit(e)}>{e.title}</button>
                </h3>
                <p>
                  {e.start.slice(0, 10) === selected
                    ? e.start.slice(11)
                    : "Depuis le " + e.start.slice(0, 10)}{" "}
                  –{" "}
                  {e.end.slice(0, 10) === selected
                    ? e.end.slice(11)
                    : e.end.slice(0, 10) + " " + e.end.slice(11)}
                </p>
                {e.timeZone !== p.timeZone ? (
                  <small>Fuseau de cette séance : {e.timeZone}</small>
                ) : null}
                <p>
                  {e.itemNumbers.length} item(s) · {e.colleges.length}{" "}
                  collège(s) · {e.cardKeys.length} carte(s)
                </p>
                {e.notes ? <p className="cal-event-notes">{e.notes}</p> : null}
                <div className="cal-event-actions">
                  {e.kind === "revision" ? (
                    <button
                      disabled={!p.canStart(e)}
                      title={
                        p.canStart(e)
                          ? "Ouvrir le contenu associé"
                          : "Associe des contenus disponibles pour commencer"
                      }
                      onClick={() => p.onStart(e)}
                    >
                      <Play />
                      Commencer
                    </button>
                  ) : null}
                  <button
                    disabled={p.busy}
                    onClick={() =>
                      void p
                        .onSave({ ...e, completed: !e.completed })
                        .catch(() => {})
                    }
                  >
                    <Check />
                    {e.completed ? "Rouvrir" : "Terminer"}
                  </button>
                  <button onClick={() => edit(e)}>Déplacer / modifier</button>
                  <button
                    onClick={() => {
                      const copy = {
                        ...e,
                        id: crypto.randomUUID(),
                        title: e.title + " (copie)",
                        completed: false,
                      };
                      delete copy.etag;
                      edit(copy);
                    }}
                  >
                    Dupliquer
                  </button>
                </div>
              </article>
            ))
          )}
        </aside>
      </div>
      <dialog
        ref={dialog}
        className="cal-dialog"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
      >
        {editing ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const validation = validateCalendarEvent(editing);
              if (validation) {
                setError(validation);
                return;
              }
              try {
                await p.onSave({ ...editing, title: editing.title.trim() });
              } catch (e) {
                setError((e as Error).message);
                return;
              }
              setSelected(editing.start.slice(0, 10));
              setMonth(editing.start.slice(0, 7));
              close();
            }}
          >
            <header>
              <h2>
                {p.events[editing.id]
                  ? "Modifier la séance"
                  : "Planifier une séance"}
              </h2>
              <button type="button" aria-label="Fermer" onClick={close}>
                <Xmark />
              </button>
            </header>
            <label>
              Titre
              <input
                required
                maxLength={160}
                autoFocus
                value={editing.title}
                onChange={(e) =>
                  setEditing({ ...editing, title: e.target.value })
                }
              />
            </label>
            <div className="cal-form-row">
              <label>
                Type
                <select
                  aria-label="Type"
                  value={editing.kind}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      kind: e.target.value as CalendarEvent["kind"],
                    })
                  }
                >
                  <option value="revision">Révision</option>
                  <option value="exam">Examen</option>
                </select>
              </label>
              {editing.kind === "revision" ? (
                <label>
                  Contenu
                  <select
                    aria-label="Contenu"
                    value={editing.activity}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        activity: e.target.value as CalendarEvent["activity"],
                      })
                    }
                  >
                    <option value="flashcards">Flashcards</option>
                    <option value="items">Items</option>
                  </select>
                </label>
              ) : null}
            </div>
            <div className="cal-form-row">
              <label>
                Début
                <input
                  type="datetime-local"
                  required
                  value={editing.start}
                  onChange={(e) =>
                    setEditing({ ...editing, start: e.target.value })
                  }
                />
              </label>
              <label>
                Fin
                <input
                  type="datetime-local"
                  required
                  min={editing.start}
                  value={editing.end}
                  onChange={(e) =>
                    setEditing({ ...editing, end: e.target.value })
                  }
                />
              </label>
            </div>
            <small>
              Horaires enregistrés dans le fuseau {editing.timeZone}.
            </small>
            <fieldset className="cal-picker">
              <legend>Contenus associés (facultatif)</legend>
              <div className="cal-picker-tabs">
                {(["items", "colleges", "cards"] as const).map((kind) => (
                  <button
                    type="button"
                    aria-pressed={pick === kind}
                    key={kind}
                    onClick={() => {
                      setPick(kind);
                      setQuery("");
                    }}
                  >
                    {kind === "items"
                      ? "Items"
                      : kind === "colleges"
                        ? "Collèges"
                        : "Flashcards"}
                  </button>
                ))}
              </div>
              <input
                aria-label="Rechercher un contenu à associer"
                type="search"
                placeholder="Rechercher…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <div className="cal-picker-results">
                {matches.slice(0, 30).map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={values.includes(option.value)}
                      onChange={() => toggle(option.value)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
                {matches.length > 30 ? (
                  <p>
                    Affine la recherche pour voir les {matches.length}{" "}
                    résultats.
                  </p>
                ) : null}
                {!matches.length ? <p>Aucun contenu trouvé.</p> : null}
              </div>
              <div className="cal-selected">
                {selectedOptions.map((o) => (
                  <button
                    key={o.kind + o.value}
                    type="button"
                    aria-label={"Retirer " + o.label}
                    onClick={() =>
                      setEditing({
                        ...editing,
                        ...(o.kind === "items"
                          ? {
                              itemNumbers: editing.itemNumbers.filter(
                                (n) => String(n) !== o.value,
                              ),
                            }
                          : o.kind === "colleges"
                            ? {
                                colleges: editing.colleges.filter(
                                  (v) => v !== o.value,
                                ),
                              }
                            : {
                                cardKeys: editing.cardKeys.filter(
                                  (v) => v !== o.value,
                                ),
                              }),
                      })
                    }
                  >
                    {o.label}
                    <Xmark />
                  </button>
                ))}
              </div>
            </fieldset>
            <label>
              Rappel (Apple et cloche ItemsTracker)
              <select
                value={
                  editing.reminderMinutes === null
                    ? "none"
                    : editing.reminderMinutes
                }
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    reminderMinutes:
                      e.target.value === "none" ? null : Number(e.target.value),
                  })
                }
              >
                <option value="none">Aucun rappel</option>
                {[0, 5, 15, 30, 60, 1440].map((n) => (
                  <option key={n} value={n}>
                    {n === 0
                      ? "Au début"
                      : n === 1440
                        ? "1 jour avant"
                        : n + " min avant"}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Notes
              <textarea
                maxLength={4000}
                rows={3}
                value={editing.notes}
                onChange={(e) =>
                  setEditing({ ...editing, notes: e.target.value })
                }
              />
            </label>
            {overlappingEvents(p.events, editing).length ? (
              <p className="cal-warning">
                Ce créneau chevauche une autre séance. Tu peux quand même
                l’enregistrer.
              </p>
            ) : null}
            {error ? (
              <div role="alert" className="cal-error">
                <p>{error}</p>
                {p.events[editing.id] ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing({ ...p.events[editing.id] });
                        setError("");
                      }}
                    >
                      Charger la version récente
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const copy = {
                          ...editing,
                          id: crypto.randomUUID(),
                          title: editing.title + " (copie)",
                        };
                        delete copy.etag;
                        setEditing(copy);
                        setError("");
                      }}
                    >
                      Conserver ma version comme copie
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}
            <footer>
              {p.events[editing.id] ? (
                <button
                  type="button"
                  className="cal-delete"
                  disabled={p.busy}
                  onClick={() => {
                    if (window.confirm("Supprimer cette séance ?"))
                      void p
                        .onDelete(editing.id)
                        .then(close)
                        .catch((e) => setError(e.message));
                  }}
                >
                  Supprimer
                </button>
              ) : null}
              <button type="button" onClick={close}>
                Annuler
              </button>
              <button disabled={p.busy} className="cal-primary" type="submit">
                Enregistrer
              </button>
            </footer>
          </form>
        ) : null}
      </dialog>
    </section>
  );
}
