import {
  useCallback,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import { Bell, Eye, GraphUp, Globe, User, Clock } from "iconoir-react";
import { AdminAnnouncements } from "./Announcements";
import { AdminGlobe } from "./AdminGlobe";
import {
  adminApi,
  AdminApiError,
  countryName,
  formatDuration,
  sectionLabels,
  type AnalyticsData,
  type GeoPoint,
} from "../lib/admin-api";
import "./admin-dashboard.css";
type View = "overview" | "live" | "users" | "visitors" | "announcements";
type Detail = {
  entity: string;
  sessions: {
    id: string;
    started_at: string;
    last_seen: string;
    section: string;
    country: string | null;
    city: string | null;
    seconds: number;
    reviews: number;
    sections: {
      section: string;
      seconds: number;
      reviews: number;
      visits: number;
    }[];
  }[];
};
const menu: { id: View; label: string; Icon: typeof Bell }[] = [
  { id: "overview", label: "Vue d’ensemble", Icon: GraphUp },
  { id: "live", label: "En direct", Icon: Globe },
  { id: "users", label: "Utilisateurs", Icon: User },
  { id: "visitors", label: "Visiteurs", Icon: Eye },
  { id: "announcements", label: "Annonces", Icon: Bell },
];
const number = (v: number) => v.toLocaleString("fr-FR");
const shortId = (id: string) => id.slice(0, 12);
function LineChart({
  data,
  visitors = false,
}: {
  data: AnalyticsData;
  visitors?: boolean;
}) {
  const today = new Date().toLocaleDateString("en-CA"),
    dates = Array.from({ length: data.days }, (_, i) => {
      const d = new Date(today + "T12:00:00");
      d.setDate(d.getDate() - data.days + 1 + i);
      return d.toLocaleDateString("en-CA");
    });
  const rows = dates.map((day) => ({
      day,
      users: 0,
      visitors: 0,
      registrations: 0,
      ...data.daily.find((d) => d.day === day),
    })),
    max =
      4 *
      Math.ceil(
        Math.max(
          1,
          ...rows.map((d) =>
            visitors ? d.visitors : Math.max(d.users, d.registrations || 0),
          ),
        ) / 4,
      );
  const path = (key: "users" | "visitors" | "registrations") =>
    rows
      .map(
        (d, i) =>
          `${i ? "L" : "M"}${30 + (i * 620) / Math.max(1, rows.length - 1)},${190 - ((d[key] || 0) * 160) / max}`,
      )
      .join(" ");
  return (
    <>
      <svg
        className="admin-chart"
        viewBox="0 0 680 220"
        role="img"
        aria-label={
          visitors
            ? "Évolution des visiteurs uniques par jour"
            : "Évolution quotidienne des inscriptions et utilisateurs actifs"
        }
      >
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line
              x1="30"
              x2="650"
              y1={190 - v * 160}
              y2={190 - v * 160}
              stroke="#203751"
            />
            <text
              x="24"
              y={194 - v * 160}
              textAnchor="end"
              fill="#8ca7c7"
              fontSize="11"
            >
              {Math.round(max * v)}
            </text>
          </g>
        ))}
        <path
          d={path(visitors ? "visitors" : "users")}
          fill="none"
          stroke="#30d6dc"
          strokeWidth="2.5"
        />
        {!visitors && (
          <path
            d={path("registrations")}
            fill="none"
            stroke="#4289ff"
            strokeWidth="2.5"
          />
        )}
        {[0, Math.floor((rows.length - 1) / 2), rows.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <text
              key={i}
              x={30 + (i * 620) / Math.max(1, rows.length - 1)}
              y="213"
              textAnchor={
                i === 0 ? "start" : i === rows.length - 1 ? "end" : "middle"
              }
              fill="#8ca7c7"
              fontSize="11"
            >
              {new Date(rows[i].day + "T12:00:00").toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "short",
              })}
            </text>
          ))}
      </svg>
      <div className="admin-chart-legend">
        <span className="cyan-dot" />
        {visitors ? "Visiteurs uniques" : "Utilisateurs actifs"}
        {!visitors && (
          <>
            <span className="blue-dot" />
            Inscriptions globales
          </>
        )}
      </div>
    </>
  );
}
function EntityDetail({
  entity,
  days,
  onClose,
}: {
  entity: string;
  days: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [data, setData] = useState<Detail | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const dialog = ref.current;
    dialog?.showModal();
    void adminApi<Detail>(
      `/api/admin/analytics/entities/${entity}?days=${days}`,
      { signal: controller.signal },
    )
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => {
      controller.abort();
      dialog?.close();
    };
  }, [entity, days]);
  return (
    <dialog ref={ref} className="admin-detail-dialog" onCancel={onClose}>
      <header>
        <div>
          <small>Fiche d’usage · {days} jours</small>
          <h2>{shortId(entity)}</h2>
        </div>
        <button onClick={onClose} aria-label="Fermer la fiche">
          ✕
        </button>
      </header>
      <p className="admin-full-id">{entity}</p>
      <p>Aucun nom, e-mail ou contenu de révision n’est affiché.</p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p>Chargement des sessions…</p>
      ) : (
        <>
          <div className="admin-detail-stats">
            <span>
              <strong>{number(data.sessions.length)}</strong>sessions affichées
            </span>
            <span>
              <strong>
                {formatDuration(
                  data.sessions.reduce((sum, s) => sum + s.seconds, 0),
                )}
              </strong>
              temps actif
            </span>
            <span>
              <strong>
                {number(data.sessions.reduce((sum, s) => sum + s.reviews, 0))}
              </strong>
              cartes révisées
            </span>
          </div>
          <small>Les 200 dernières sessions au maximum.</small>
          <div className="admin-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Sections consultées</th>
                  <th>Temps actif</th>
                  <th>Cartes révisées</th>
                  <th>Localisation</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.started_at).toLocaleString("fr-FR")}</td>
                    <td>
                      {s.sections.map((a) => (
                        <div key={a.section}>
                          {sectionLabels[a.section] || a.section} ·{" "}
                          {formatDuration(a.seconds)} · {a.visits} visites
                        </div>
                      ))}
                    </td>
                    <td>{formatDuration(s.seconds)}</td>
                    <td>{s.reviews}</td>
                    <td>
                      {s.city ? s.city + ", " : ""}
                      {countryName(s.country)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </dialog>
  );
}
export function AdminDashboard() {
  const [view, setView] = useState<View>("overview"),
    [days, setDays] = useState(30),
    [geoFilter, setGeoFilter] = useState<GeoPoint | null>(null),
    [mapLive, setMapLive] = useState(false),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<AnalyticsData | null>(null),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false),
    [loading, setLoading] = useState(true),
    [entity, setEntity] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search),
    currentRequest = useRef<AbortController | null>(null),
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ready = Boolean(data);
  const kind =
      view === "users" ? "user" : view === "visitors" ? "visitor" : "all",
    live = view === "live" || mapLive;
  const params = new URLSearchParams({
    days: String(days),
    kind,
    live: String(live),
    timeZone,
    page: String(page),
    limit: view === "overview" ? "5" : "50",
    entityKind: view === "overview" ? "user" : kind,
    allAccounts: String(view === "users"),
    search: deferredSearch,
    ...(geoFilter ? { country: geoFilter.country, city: geoFilter.city } : {}),
  }).toString();
  const load = useCallback(async () => {
    currentRequest.current?.abort();
    const controller = new AbortController();
    currentRequest.current = controller;
    setLoading(true);
    try {
      const result = await adminApi<AnalyticsData>(
        "/api/admin/analytics?" + params,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setData(result);
      setError("");
      setDenied(false);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError((e as Error).message);
      if (e instanceof AdminApiError && [401, 403].includes(e.status)) {
        setDenied(true);
        setData(null);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [params]);
  useEffect(() => {
    if (view === "announcements" && ready) return;
    const initial = setTimeout(() => void load(), 0),
      timer = setInterval(() => {
        if (!document.hidden) void load();
      }, 30000);
    const focus = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", focus);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      currentRequest.current?.abort();
      document.removeEventListener("visibilitychange", focus);
    };
  }, [load, view, ready]);
  const navigate = (id: View) => {
    setView(id);
    setPage(1);
    setSearch("");
    setEntity(null);
    setMapLive(false);
  };
  const filter = (point: GeoPoint) => {
    setGeoFilter(point);
    setPage(1);
  };
  const exportView = () => {
    if (!data) return;
    const rows = [
      ["Vue", menu.find((m) => m.id === view)?.label || ""],
      ["Période", String(days) + " jours"],
      [
        "Filtre géographique",
        geoFilter ? `${geoFilter.city} ${geoFilter.country}` : "Tous",
      ],
      ["Comptes inscrits (global)", String(data.metrics.registered)],
      ["Nouveaux inscrits (global)", String(data.metrics.newRegistrations)],
      ["Temps actif (secondes)", String(data.metrics.active_seconds)],
      ["Cartes révisées", String(data.metrics.reviews)],
      [],
      [
        "Identifiant",
        "Type",
        "Dernière activité",
        "Section",
        "Temps actif (secondes)",
        "Cartes révisées",
        "Pays",
        "Ville",
      ],
      ...data.users.map((u) => [
        u.entity,
        u.kind,
        u.last_seen || "",
        u.section,
        String(u.seconds),
        String(u.reviews),
        u.country || "",
        u.city || "",
      ]),
    ];
    const csv =
        "\uFEFF" +
        rows
          .map((r) =>
            r
              .map(
                (c) =>
                  '"' +
                  (/^[=+@-]/.test(c) ? "'" : "") +
                  c.replaceAll('"', '""') +
                  '"',
              )
              .join(";"),
          )
          .join("\r\n"),
      url = URL.createObjectURL(
        new Blob([csv], { type: "text/csv;charset=utf-8" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "itemstracker-admin-vue.csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const metrics = data?.metrics;
  return (
    <div className="admin-console">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true">
            <i />
          </span>
          <div>
            <strong>ItemsTracker</strong>
            <small>Administration</small>
          </div>
        </div>
        <nav aria-label="Administration">
          {menu.map((m) => (
            <button
              key={m.id}
              className={view === m.id ? "active" : ""}
              aria-current={view === m.id ? "page" : undefined}
              onClick={() => navigate(m.id)}
              disabled={denied}
            >
              <span aria-hidden="true">
                <m.Icon />
              </span>
              {m.label}
              {m.id === "live" && <i className="admin-live-dot" />}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-note">
          Accès privé
          <br />
          Données d’usage par identifiant
          <br />
          Historique : 12 mois
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div>
            <h1>{menu.find((m) => m.id === view)?.label}</h1>
            <p>
              {view === "announcements"
                ? "Préparer et publier les nouveautés de l’application."
                : "Visiteurs et utilisateurs · statistiques séparées"}
            </p>
          </div>
          {view !== "announcements" && !denied && (
            <div className="admin-header-actions">
              <label>
                Période
                <select
                  aria-label="Période des statistiques"
                  value={days}
                  onChange={(e) => {
                    setDays(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  {[
                    [1, "Aujourd’hui"],
                    [7, "7 derniers jours"],
                    [30, "30 derniers jours"],
                    [90, "90 derniers jours"],
                    [365, "12 derniers mois"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={exportView} disabled={!data}>
                ↓ Exporter la vue
              </button>
            </div>
          )}
        </header>
        {error && (
          <div className="admin-status admin-error" role="alert">
            {error}
            {denied ? (
              <p>
                Connecte-toi avec le compte autorisé dans{" "}
                <a href="./app.html">l’application</a>, puis recharge cette
                page.
              </p>
            ) : null}
            <button onClick={() => void load()}>Réessayer</button>
          </div>
        )}
        {!data && !denied && !error ? (
          <p role="status">Chargement de l’administration…</p>
        ) : null}
        {data && !denied && view === "announcements" ? (
          <AdminAnnouncements embedded />
        ) : data && !denied && metrics ? (
          <>
            <div className="admin-data-meta">
              <span>
                <i className="admin-live-dot" />
                {loading ? "Actualisation…" : "Données du serveur"} ·{" "}
                {new Date(data.updatedAt).toLocaleTimeString("fr-FR")}
              </span>
              <span>Actualisation toutes les 30 s</span>
            </div>
            {geoFilter && (
              <div className="admin-filter-banner">
                Localisation :{" "}
                {geoFilter.city || countryName(geoFilter.country)}
                <button
                  onClick={() => {
                    setGeoFilter(null);
                    setPage(1);
                  }}
                >
                  Effacer le filtre ✕
                </button>
                <small>Les inscriptions restent globales.</small>
              </div>
            )}
            <section className="admin-kpis" aria-label="Indicateurs clés">
              {[
                {
                  label: "Comptes inscrits",
                  value: number(metrics.registered),
                  note: "Total des comptes · global",
                  Icon: User,
                },
                {
                  label: "Nouveaux inscrits",
                  value: number(metrics.newRegistrations),
                  note: `Sur ${days} jours · global`,
                  Icon: User,
                },
                {
                  label:
                    view === "visitors"
                      ? "Visiteurs aujourd’hui"
                      : "Actifs aujourd’hui",
                  value: number(
                    view === "visitors"
                      ? metrics.visitors_today
                      : metrics.active_today,
                  ),
                  note:
                    view === "visitors"
                      ? "Page de vente"
                      : "Utilisateurs connectés",
                  Icon: Clock,
                },
                {
                  label: "En ligne",
                  value: number(metrics.live_users + metrics.live_visitors),
                  note: `${metrics.live_users} utilisateurs · ${metrics.live_visitors} visiteurs`,
                  Icon: Globe,
                },
              ].map((k) => (
                <article className="admin-card admin-kpi" key={k.label}>
                  <span className="admin-kpi-icon" aria-hidden="true">
                    <k.Icon />
                  </span>
                  <div>
                    <h2>{k.label}</h2>
                    <strong>{k.value}</strong>
                    <small>{k.note}</small>
                  </div>
                </article>
              ))}
            </section>
            {(view === "overview" || view === "live") && (
              <>
                <div className="admin-overview-grid">
                  <section className="admin-card admin-chart-card">
                    <h2>Inscriptions et activité</h2>
                    <LineChart data={data} />
                  </section>
                  <section className="admin-card admin-geography">
                    <header>
                      <h2>Présence géographique</h2>
                      <label className="admin-map-live">
                        <input
                          type="checkbox"
                          checked={live}
                          disabled={view === "live"}
                          onChange={(e) => {
                            setMapLive(e.target.checked);
                            setPage(1);
                          }}
                        />
                        En direct
                      </label>
                    </header>
                    <label className="admin-country-filter">
                      Pays
                      <select
                        aria-label="Filtrer par pays"
                        value={geoFilter?.country || ""}
                        onChange={(e) => {
                          if (!e.target.value) {
                            setGeoFilter(null);
                            setPage(1);
                          } else
                            filter({
                              country: e.target.value,
                              city: "",
                              latitude: null,
                              longitude: null,
                              users: 0,
                              visitors: 0,
                            });
                        }}
                      >
                        <option value="">Tous les pays</option>
                        {[
                          ...new Set([
                            ...data.locations.map((p) => p.country),
                            geoFilter?.country || "",
                          ]),
                        ]
                          .filter(Boolean)
                          .sort()
                          .map((country) => (
                            <option key={country} value={country}>
                              {countryName(country)}
                            </option>
                          ))}
                      </select>
                    </label>
                    <div className="admin-geography-body">
                      <AdminGlobe
                        points={data.locations}
                        onSelect={filter}
                        selected={geoFilter}
                      />
                      <div className="admin-location-list">
                        <h3>Pays et villes</h3>
                        {data.locations
                          .filter((p) => p.country)
                          .slice(0, 8)
                          .map((p, i) => (
                            <button key={i} onClick={() => filter(p)}>
                              <span>
                                {p.city || countryName(p.country)}
                                <small>
                                  {p.city
                                    ? countryName(p.country)
                                    : "Ville inconnue"}
                                </small>
                              </span>
                              <strong>{p.users + p.visitors}</strong>
                            </button>
                          ))}
                        {!data.locations.some((p) => p.country) && (
                          <p>Aucune localisation disponible pour cette vue.</p>
                        )}
                        <small>
                          {metrics.unknown_locations} sessions sans localisation
                        </small>
                      </div>
                    </div>
                    <div className="admin-geo-note">
                      {!data.geo.ready ? (
                        <span>
                          {data.geo.loading
                            ? "Géolocalisation en préparation."
                            : "Géolocalisation indisponible. " + data.geo.error}
                        </span>
                      ) : (
                        <span>Positions approximatives par adresse IP.</span>
                      )}
                      <a
                        href="https://db-ip.com"
                        target="_blank"
                        rel="noreferrer"
                      >
                        IP Geolocation by DB-IP
                      </a>
                    </div>
                  </section>
                </div>
                <div className="admin-secondary-grid">
                  <section className="admin-card">
                    <h2>Temps actif</h2>
                    <div className="admin-usage-grid">
                      <div className="admin-big-metric">
                        <strong>
                          {formatDuration(
                            metrics.user_sessions
                              ? metrics.user_active_seconds /
                                  metrics.user_sessions
                              : 0,
                          )}
                        </strong>
                        <small>Moyenne par session utilisateur</small>
                        <p>{number(metrics.reviews)} cartes révisées</p>
                      </div>
                      <div className="admin-section-bars">
                        {data.sections
                          .filter((s) => s.section !== "sales")
                          .map((s) => (
                            <div key={s.section}>
                              <span>
                                {sectionLabels[s.section] || s.section}
                              </span>
                              <strong>{formatDuration(s.seconds)}</strong>
                              <i
                                style={{
                                  width: `${Math.max(1, (s.seconds / Math.max(1, ...data.sections.filter((a) => a.section !== "sales").map((a) => a.seconds))) * 100)}%`,
                                }}
                              />
                            </div>
                          ))}
                        {!data.sections.length && (
                          <p>Aucune activité mesurée sur cette période.</p>
                        )}
                      </div>
                    </div>
                  </section>
                  <section className="admin-card">
                    <h2>Visiteurs de la page de vente</h2>
                    <div className="admin-visitor-metric">
                      <strong>{number(metrics.visitors)}</strong>
                      <small>
                        Visiteurs distincts sur cette période · suivi séparé des
                        comptes
                      </small>
                    </div>
                    <LineChart data={data} visitors />
                  </section>
                </div>
              </>
            )}
            <section className="admin-card admin-entities">
              <header>
                <h2>
                  {view === "visitors"
                    ? "Visiteurs de la page de vente"
                    : view === "live"
                      ? "Présents en direct"
                      : "Utilisateurs récemment actifs"}
                </h2>
                <label>
                  <span className="admin-sr-only">
                    Rechercher un identifiant
                  </span>
                  <input
                    placeholder="Rechercher un identifiant…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
              </header>
              <div className="admin-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Identifiant</th>
                      <th>Dernière activité</th>
                      <th>Section</th>
                      <th>Temps actif</th>
                      <th>Cartes révisées</th>
                      <th>Localisation</th>
                      <th>Présence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users
                      .filter((u) => view !== "overview" || u.kind === "user")
                      .map((u) => (
                        <tr key={u.entity}>
                          <td>
                            <button
                              className="admin-entity-link"
                              onClick={() => setEntity(u.entity)}
                              title={u.entity}
                            >
                              {shortId(u.entity)}
                              <small>
                                {u.kind === "user" ? "Utilisateur" : "Visiteur"}
                              </small>
                            </button>
                          </td>
                          <td>
                            {u.last_seen
                              ? new Date(u.last_seen).toLocaleString("fr-FR", {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "Aucune session mesurée"}
                          </td>
                          <td>
                            {sectionLabels[u.section] || u.section || "—"}
                          </td>
                          <td>{formatDuration(u.seconds)}</td>
                          <td>{u.reviews}</td>
                          <td>
                            {u.city ? u.city + ", " : ""}
                            {countryName(u.country)}
                          </td>
                          <td>
                            {u.live ? (
                              <span className="admin-live-label">
                                <i className="admin-live-dot" />
                                En ligne
                              </span>
                            ) : (
                              "Hors ligne"
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!data.users.filter(
                (u) => view !== "overview" || u.kind === "user",
              ).length && (
                <p className="admin-empty">
                  Aucune session correspondant à cette vue. Le suivi commence à
                  la mise en service.
                </p>
              )}
              <footer>
                <small>
                  {number(data.totalEntities)} identifiants dans la sélection ·
                  suivi depuis le{" "}
                  {new Date(data.startedAt).toLocaleDateString("fr-FR")}
                </small>
                <div>
                  <button
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    ← Précédent
                  </button>
                  <span>Page {page}</span>
                  <button
                    disabled={page * data.limit >= data.totalEntities}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Suivant →
                  </button>
                </div>
              </footer>
            </section>
            <details className="admin-definitions">
              <summary>Comprendre les mesures</summary>
              <p>
                En ligne : onglet visible, interaction datant de moins de 2
                minutes et signal reçu depuis moins de 90 secondes. Temps actif
                : pauses lorsque l’onglet est masqué, sans focus ou inactif.
                Cartes révisées : évaluations réalisées, sans conserver les
                questions ni les réponses. Visiteur : identifiant séparé dans le
                navigateur pour la visite de la page de vente ; aucun
                rapprochement avec un compte. Les comptes administrateurs sont
                exclus du suivi d’usage. Les inscriptions sont globales et les
                positions approximatives. Les navigateurs demandant à ne pas
                être suivis sont exclus. Les statistiques ne reconstituent pas
                l’activité passée avant la mise en service.
              </p>
            </details>
          </>
        ) : null}
      </main>
      {entity && (
        <EntityDetail
          entity={entity}
          days={days}
          onClose={() => setEntity(null)}
        />
      )}
    </div>
  );
}
