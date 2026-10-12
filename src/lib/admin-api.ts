export class AdminApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export async function adminApi<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "");
  const token = localStorage.getItem("med_auth_token");
  const response = await fetch(base + url, {
    ...init,
    signal: init.signal || AbortSignal.timeout(20000),
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Version": "0.1.0",
      ...(token ? { Authorization: "Bearer " + token } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json();
  if (!response.ok)
    throw new AdminApiError(
      response.status,
      payload.error || "Impossible de joindre le service.",
    );
  return payload as T;
}
export const sectionLabels: Record<string, string> = {
  dashboard: "Dashboard",
  items: "Items",
  flashcards: "Flashcards",
  colleges: "Collèges",
  calendar: "Calendrier",
  settings: "Profil",
  stats: "Insights",
  revision: "Révision",
  sales: "Page de vente",
};
export const formatDuration = (seconds: number) =>
  seconds < 60
    ? `${Math.round(seconds)} s`
    : seconds < 3600
      ? `${Math.round(seconds / 60)} min`
      : `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`;
export const countryName = (code: string | null) => {
  if (!code) return "Localisation inconnue";
  try {
    return new Intl.DisplayNames(["fr"], { type: "region" }).of(code) || code;
  } catch {
    return code;
  }
};
export type GeoPoint = {
  country: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  users: number;
  visitors: number;
};
export type AdminEntity = {
  entity: string;
  kind: "user" | "visitor";
  last_seen: string | null;
  sessions: number;
  seconds: number;
  reviews: number;
  live: boolean;
  section: string;
  country: string | null;
  city: string | null;
};
export type AnalyticsData = {
  metrics: {
    registered: number;
    newRegistrations: number;
    sessions: number;
    users: number;
    visitors: number;
    active_today: number;
    live_users: number;
    live_visitors: number;
    active_seconds: number;
    user_active_seconds: number;
    visitor_active_seconds: number;
    user_sessions: number;
    visitor_sessions: number;
    visitors_today: number;
    reviews: number;
    unknown_locations: number;
  };
  daily: {
    day: string;
    users: number;
    visitors: number;
    registrations?: number;
  }[];
  locations: GeoPoint[];
  sections: {
    section: string;
    seconds: number;
    reviews: number;
    visits: number;
  }[];
  users: AdminEntity[];
  totalEntities: number;
  page: number;
  limit: number;
  startedAt: string;
  updatedAt: string;
  days: number;
  geo: {
    ready: boolean;
    loading: boolean;
    error: string;
    databaseDate: string | null;
    provider: string;
    attribution: string;
  };
};
