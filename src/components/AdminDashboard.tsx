import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent,
  type SVGProps,
} from "react";
import { Bell, Eye, Globe, User, Clock, SunLight, HalfMoon, LogOut, NavArrowRight, SidebarCollapse } from "iconoir-react";
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
const readOnlyPreview = import.meta.env.VITE_ADMIN_READ_ONLY_PREVIEW === "true";
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
function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="3" width="7" height="10" rx="1.5" />
    <rect x="14" y="3" width="7" height="6" rx="1.5" />
    <rect x="3" y="17" width="7" height="4" rx="1" />
    <rect x="14" y="13" width="7" height="8" rx="1.5" />
  </svg>;
}
const menu = [
  { id: "overview", label: "Vue d’ensemble", mobileLabel: "Dashboard", Icon: DashboardIcon },
  { id: "live", label: "En direct", mobileLabel: "Direct", Icon: Globe },
  { id: "users", label: "Utilisateurs", mobileLabel: "Comptes", Icon: User },
  { id: "visitors", label: "Visiteurs", mobileLabel: "Visiteurs", Icon: Eye },
  { id: "announcements", label: "Annonces", mobileLabel: "Annonces", Icon: Bell },
] as const;
type NavigationGesture = { pointerId: number; startX: number; startY: number; firstCenter: number; step: number; dragging: boolean };
function AdminMobileNavigation({ active, onNavigate, disabled }: { active: View; onNavigate: (view: View) => void; disabled: boolean }) {
  const navRef = useRef<HTMLElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<NavigationGesture | null>(null);
  const suppressClick = useRef(false);
  const [step, setStep] = useState(0);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const selectedIndex = menu.findIndex(item => item.id === active);
  const visualIndex = dragIndex === null ? selectedIndex : Math.round(dragIndex);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const buttons = nav.querySelectorAll("button");
      if (buttons.length < 2) return;
      setStep(buttons[1].getBoundingClientRect().left - buttons[0].getBoundingClientRect().left);
      fadeRef.current?.style.setProperty("--admin-nav-fade-rise", `${nav.getBoundingClientRect().height / 4}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);
  const cancel = () => { gesture.current = null; setDragIndex(null); };
  const indexAt = (event: PointerEvent<HTMLElement>, current: NavigationGesture) =>
    Math.max(0, Math.min(menu.length - 1, (event.clientX - current.firstCenter) / current.step));
  return <>
    <div ref={fadeRef} className="admin-mobile-nav-fade" aria-hidden="true" />
    <nav ref={navRef} className={`admin-mobile-nav${dragIndex === null ? "" : " is-dragging"}`} aria-label="Navigation mobile de l’administration"
      style={{ "--admin-mobile-offset": `${(dragIndex ?? selectedIndex) * step}px` } as CSSProperties}
      onPointerDown={event => {
        if (disabled || !event.isPrimary || event.button !== 0) return;
        suppressClick.current = false;
        const buttons = event.currentTarget.querySelectorAll("button");
        const first = buttons[0].getBoundingClientRect(), second = buttons[1].getBoundingClientRect();
        gesture.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, firstCenter: first.left + first.width / 2, step: second.left - first.left, dragging: false };
      }}
      onPointerMove={event => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        const dx = Math.abs(event.clientX - current.startX), dy = Math.abs(event.clientY - current.startY);
        if (!current.dragging) {
          if (dy > 8 && dy > dx) { cancel(); return; }
          if (dx < 8) return;
          current.dragging = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        event.preventDefault();
        setDragIndex(indexAt(event, current));
      }}
      onPointerUp={event => {
        const current = gesture.current;
        if (!current || current.pointerId !== event.pointerId) return;
        if (current.dragging) {
          suppressClick.current = true;
          onNavigate(menu[Math.round(indexAt(event, current))].id);
        }
        cancel();
      }}
      onPointerCancel={cancel}
      onLostPointerCapture={event => { if (event.target === event.currentTarget) cancel(); }}
      onClickCapture={event => {
        if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
        suppressClick.current = false;
      }}>
      <span className="admin-mobile-nav-indicator" aria-hidden="true" />
      {menu.map(({ id, mobileLabel, Icon }, index) => <button key={id} type="button" disabled={disabled} className={visualIndex === index ? "active" : ""} aria-current={selectedIndex === index ? "page" : undefined} onClick={() => onNavigate(id)}>
        <Icon aria-hidden="true" /><span>{mobileLabel}</span>
      </button>)}
    </nav>
  </>;
}
const number = (v: number) => v.toLocaleString("fr-FR");
const shortId = (id: string) => id.slice(0, 12);
const ADMIN_THEME_STORAGE_KEY = "itemstracker-admin-theme";
function initialAdminTheme(): "light" | "dark" {
  try {
    return window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}
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
  const [theme, setTheme] = useState<"light" | "dark">(initialAdminTheme),
    [view, setView] = useState<View>("overview"),
    [sidebarCollapsed, setSidebarCollapsed] = useState(false),
    [mobileMenuOpen, setMobileMenuOpen] = useState(false),
    [loggingOut, setLoggingOut] = useState(false),
    [logoutError, setLogoutError] = useState(""),
    [navBubble, setNavBubble] = useState({ top: 0, height: 0, ready: false }),
    [days, setDays] = useState(30),
    [geoFilter, setGeoFilter] = useState<GeoPoint | null>(null),
    [mapLive, setMapLive] = useState(false),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [data, setData] = useState<AnalyticsData | null>(null),
    [error, setError] = useState(""),
    [denied, setDenied] = useState(false),
    [deniedStatus, setDeniedStatus] = useState<number | null>(null),
    [loginEmail, setLoginEmail] = useState(""),
    [loginPassword, setLoginPassword] = useState(""),
    [loginBusy, setLoginBusy] = useState(false),
    [loginError, setLoginError] = useState(""),
    [loading, setLoading] = useState(true),
    [entity, setEntity] = useState<string | null>(null);
  const sidebarNavRef = useRef<HTMLElement>(null);
  const sidebarButtonRefs = useRef<Partial<Record<View, HTMLButtonElement | null>>>({});
  const mobileDialogRef = useRef<HTMLDialogElement>(null);
  const deferredSearch = useDeferredValue(search),
    currentRequest = useRef<AbortController | null>(null),
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const ready = Boolean(data);
  useLayoutEffect(() => {
    const nav = sidebarNavRef.current;
    if (!nav) return;
    const measure = () => {
      const active = sidebarButtonRefs.current[view];
      if (active) setNavBubble({ top: active.offsetTop, height: active.offsetHeight, ready: true });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [view, sidebarCollapsed]);
  useEffect(() => {
    const dialog = mobileDialogRef.current;
    if (!dialog) return;
    if (mobileMenuOpen && !dialog.open) dialog.showModal();
    if (!mobileMenuOpen && dialog.open) dialog.close();
  }, [mobileMenuOpen]);
  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, nextTheme);
    } catch {
      // The switch still works when browser storage is unavailable.
    }
  };
  const logout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      await adminApi<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
    } catch (e) {
      // The read-only local preview has no production cookie to revoke.
      if (!readOnlyPreview) {
        setLogoutError((e as Error).message || "Impossible de se déconnecter. Réessaie.");
        setLoggingOut(false);
        return;
      }
    }
    window.localStorage.removeItem("med_auth_token");
    window.location.replace(readOnlyPreview ? "./admin-app.html" : "./app.html");
  };
  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loginBusy) return;
    setLoginBusy(true);
    setLoginError("");
    try {
      const result = await adminApi<{ token?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      if (!result.token) throw new Error("Session non créée par le serveur.");
      window.localStorage.setItem("med_auth_token", result.token);
      setLoginPassword("");
      setError("");
      setDenied(false);
      await load();
    } catch (e) {
      setLoginError((e as Error).message || "Connexion impossible.");
    } finally {
      setLoginBusy(false);
    }
  };
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
      setDeniedStatus(null);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError((e as Error).message);
      if (e instanceof AdminApiError && [401, 403].includes(e.status)) {
        setDenied(true);
        setDeniedStatus(e.status);
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
    setMobileMenuOpen(false);
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
  if (deniedStatus === 401) {
    return (
      <main className="admin-console admin-auth-screen" data-admin-theme={theme}>
        <div className="admin-auth-layout">
          <section className="admin-auth-story" aria-label="ItemsTracker Administration">
            <div className="admin-auth-brand">
              <span className="admin-brand-mark" aria-hidden="true"><span className="admin-brand-bar" /></span>
              <span><strong>ItemsTracker</strong><small>Administration</small></span>
            </div>
            <div className="admin-auth-story-content">
              <span className="admin-auth-eyebrow">VOTRE ESPACE PRIVÉ</span>
              <h1>Une vue claire sur l’activité.</h1>
              <p>Retrouvez vos statistiques, suivez les usages et prenez du recul sur ce qui compte.</p>
            </div>
            <div className="admin-auth-orb" aria-hidden="true"><i /><i /><i /></div>
            <div className="admin-auth-story-footer"><span className="admin-auth-shield"><User aria-hidden="true" /></span><span>Accès réservé au compte administrateur<br />Données protégées et actualisées en direct</span></div>
          </section>
          <section className="admin-auth-panel" aria-label="Connexion administrateur">
            <button type="button" className="admin-auth-theme" role="switch" aria-checked={theme === "dark"} aria-label="Thème sombre de l’administration" onClick={toggleTheme}>
              {theme === "light" ? <SunLight aria-hidden="true" /> : <HalfMoon aria-hidden="true" />}
              <span>Thème {theme === "light" ? "clair" : "sombre"}</span>
            </button>
            <div className="admin-auth-form-wrap">
              <div className="admin-auth-icon" aria-hidden="true"><DashboardIcon /></div>
              <span className="admin-auth-form-eyebrow">ESPACE ADMINISTRATEUR</span>
              <h2>Content de te revoir.</h2>
              <p>Connecte-toi pour retrouver ton tableau de bord.</p>
              <form className="admin-auth-form" onSubmit={(event) => void login(event)}>
                <label>Adresse e-mail<input type="email" autoComplete="username" placeholder="ton@email.com" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} /></label>
                <label>Mot de passe<input type="password" autoComplete="current-password" placeholder="Ton mot de passe" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} /></label>
                {loginError && <p className="admin-auth-error" role="alert">{loginError}</p>}
                <button type="submit" disabled={loginBusy}>{loginBusy ? "Connexion…" : "Se connecter"}<NavArrowRight aria-hidden="true" /></button>
              </form>
              <p className="admin-auth-footnote">Seuls les comptes autorisés peuvent accéder aux données d’administration.</p>
            </div>
            <p className="admin-auth-source">{readOnlyPreview ? "Aperçu local en lecture seule · Données de production" : "ItemsTracker · Espace sécurisé"}</p>
          </section>
        </div>
      </main>
    );
  }
  return (
    <div className={`admin-console${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`} data-admin-theme={theme}>
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <span className="admin-brand-mark" aria-hidden="true">
            <span className="admin-brand-bar" />
          </span>
          <div className="admin-brand-titles">
            <strong>ItemsTracker</strong>
            <small>Administration</small>
          </div>
        </div>
        <nav ref={sidebarNavRef} className={navBubble.ready ? "has-bubble" : ""} aria-label="Administration">
          <p className="admin-workspace-label">WORKSPACE</p>
          <span className="admin-sidebar-bubble" aria-hidden="true" style={{ transform: `translateY(${navBubble.top}px)`, height: navBubble.height, opacity: navBubble.ready ? 1 : 0 }} />
          {menu.map((m) => (
            <button
              key={m.id}
              type="button"
              ref={node => { sidebarButtonRefs.current[m.id] = node; }}
              className={view === m.id ? "active" : ""}
              aria-current={view === m.id ? "page" : undefined}
              aria-label={m.label}
              title={sidebarCollapsed ? m.label : undefined}
              onClick={() => navigate(m.id)}
              disabled={denied}
            >
              <span className="admin-menu-icon" aria-hidden="true">
                <m.Icon />
              </span>
              <span className="admin-menu-label">{m.label}</span>
              {m.id === "live" && <i className="admin-live-dot" />}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <button
            type="button"
            className="admin-theme-toggle"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label="Thème sombre de l’administration"
            title={sidebarCollapsed ? `Thème ${theme}` : undefined}
            onClick={toggleTheme}
          >
            {theme === "light" ? <SunLight aria-hidden="true" /> : <HalfMoon aria-hidden="true" />}
            <span className="admin-footer-label">Thème {theme === "light" ? "clair" : "sombre"}</span>
            <span className="admin-theme-track" aria-hidden="true"><span /></span>
          </button>
          <button type="button" className="admin-logout-button" aria-label="Déconnexion" title={sidebarCollapsed ? "Déconnexion" : undefined} disabled={loggingOut} onClick={() => void logout()}>
            <LogOut aria-hidden="true" /><span className="admin-footer-label">{loggingOut ? "Déconnexion…" : "Déconnexion"}</span><NavArrowRight className="admin-logout-arrow" aria-hidden="true" />
          </button>
          <div className="admin-sidebar-note">
            Accès privé<br />Données d’usage par identifiant<br />Historique : 12 mois
          </div>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <div className="admin-mobile-topbar">
            <span className="admin-mobile-brand"><span className="admin-brand-mark" aria-hidden="true"><span className="admin-brand-bar" /></span><strong>ItemsTracker</strong></span>
            <button type="button" className="admin-mobile-account" aria-label="Ouvrir le menu du compte" aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen(true)}><User aria-hidden="true" /></button>
          </div>
          <div className="admin-header-heading">
            <button type="button" className="admin-collapse-button" aria-label={sidebarCollapsed ? "Étendre le menu" : "Replier le menu"} title={sidebarCollapsed ? "Étendre le menu" : "Replier le menu"} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(value => !value)}>
              {sidebarCollapsed ? <NavArrowRight aria-hidden="true" /> : <SidebarCollapse aria-hidden="true" />}
            </button>
            <div>
              <h1>{menu.find((m) => m.id === view)?.label}</h1>
              <p>{view === "announcements" ? "Préparer et publier les nouveautés de l’application." : "Visiteurs et utilisateurs · statistiques séparées"}</p>
            </div>
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
        {readOnlyPreview && <div className="admin-preview-banner" role="note">Source : API de production · aperçu local en lecture seule</div>}
        {logoutError && <div className="admin-status admin-error" role="alert">Déconnexion impossible : {logoutError}</div>}
        {error && !(readOnlyPreview && deniedStatus === 401) && (
          <div className="admin-status admin-error" role="alert">
            {error}
            {denied && !readOnlyPreview ? (
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
          <AdminAnnouncements embedded readOnly={readOnlyPreview} />
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
                <div className="admin-analytics-columns">
                  <div className="admin-analytics-column">
                  <section className="admin-card admin-chart-card">
                    <h2>Inscriptions et activité</h2>
                    <LineChart data={data} />
                  </section>
                  <section className="admin-card admin-usage-card">
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
                  </div>
                  <div className="admin-analytics-column">
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
                  <section className="admin-card admin-visitor-card">
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
      <AdminMobileNavigation active={view} onNavigate={navigate} disabled={denied} />
      <dialog ref={mobileDialogRef} className="admin-mobile-sheet" aria-label="Menu du compte administrateur" onClose={() => setMobileMenuOpen(false)} onCancel={() => setMobileMenuOpen(false)}>
        <header><h2>Mon compte</h2><button type="button" aria-label="Fermer le menu" onClick={() => setMobileMenuOpen(false)}>✕</button></header>
        <button type="button" className="admin-mobile-sheet-action" role="switch" aria-checked={theme === "dark"} aria-label="Thème sombre de l’administration" onClick={toggleTheme}>
          {theme === "light" ? <SunLight aria-hidden="true" /> : <HalfMoon aria-hidden="true" />}<span>Thème {theme === "light" ? "clair" : "sombre"}</span><span className="admin-theme-track" aria-hidden="true"><span /></span>
        </button>
        <button type="button" className="admin-mobile-sheet-action" disabled={loggingOut} onClick={() => void logout()}><LogOut aria-hidden="true" /><span>{loggingOut ? "Déconnexion…" : "Déconnexion"}</span><NavArrowRight aria-hidden="true" /></button>
        {logoutError && <p role="alert">Déconnexion impossible : {logoutError}</p>}
      </dialog>
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
