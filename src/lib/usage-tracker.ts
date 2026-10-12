type UsageSection =
  | "dashboard"
  | "items"
  | "flashcards"
  | "colleges"
  | "calendar"
  | "settings"
  | "stats"
  | "revision"
  | "sales";
type Counter = {
  section: UsageSection;
  seconds: number;
  reviews: number;
  visits: number;
};
type TrackerOptions = {
  kind: "user" | "visitor";
  apiBase: string;
  getSection: () => string;
  getToken?: () => string;
};
const allowed = new Set([
  "dashboard",
  "items",
  "flashcards",
  "colleges",
  "calendar",
  "settings",
  "stats",
  "revision",
  "sales",
]);
/** Shared collector for the app and landing. No content, URLs, names or emails. */
export function startUsageTracker({
  kind,
  apiBase,
  getSection,
  getToken,
}: TrackerOptions) {
  if (
    navigator.doNotTrack === "1" ||
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl ||
    /bot|crawl|spider|headless/i.test(navigator.userAgent)
  )
    return () => {};
  let visitorId: string | undefined;
  if (kind === "visitor") {
    try {
      visitorId =
        sessionStorage.getItem("it_sales_visitor") || crypto.randomUUID();
      sessionStorage.setItem("it_sales_visitor", visitorId);
    } catch {
      visitorId = crypto.randomUUID();
    }
  }
  let sessionId = crypto.randomUUID(),
    sequence = 0,
    counters = new Map<UsageSection, Counter>(),
    lastSection: UsageSection | undefined;
  let lastActivity = Date.now(),
    lastTick = Date.now(),
    day = new Date().toISOString().slice(0, 10),
    lastSentActive: boolean | undefined,
    stopped = false,
    inFlight = false;
  let active = false;
  const currentSection = (): UsageSection =>
    kind === "visitor"
      ? "sales"
      : allowed.has(getSection())
        ? (getSection() as UsageSection)
        : "dashboard";
  const counter = () => {
    const section = currentSection();
    let c = counters.get(section);
    if (!c) {
      c = { section, seconds: 0, reviews: 0, visits: 0 };
      counters.set(section, c);
    }
    if (lastSection !== section) {
      c.visits++;
      lastSection = section;
    }
    return c;
  };
  const snapshot = () => ({
    kind,
    sessionId,
    ...(visitorId ? { visitorId } : {}),
    sequence: sequence++,
    section: currentSection(),
    active,
    sections: [...counters.values()].map((c) => ({
      ...c,
      seconds: Math.floor(c.seconds),
    })),
  });
  const headers = () => ({
    "Content-Type": "application/json",
    ...(kind === "user" && getToken?.()
      ? { Authorization: "Bearer " + getToken() }
      : {}),
  });
  const flush = (final = false) => {
    if (stopped || (inFlight && !final)) return;
    const payload = snapshot();
    lastSentActive = active;
    inFlight = true;
    void fetch(apiBase.replace(/\/+$/, "") + "/api/analytics/pulse", {
      method: "POST",
      headers: headers(),
      credentials: kind === "user" ? "include" : "omit",
      body: JSON.stringify(payload),
      keepalive: final,
      signal: final ? undefined : AbortSignal.timeout(12000),
    })
      .then(async (response) => {
        if (response.ok && (await response.json()).disabled) stopped = true;
      })
      .catch(() => {
        /* Analytics never interrupt application saves or navigation. */
      })
      .finally(() => {
        inFlight = false;
      });
  };
  const tick = () => {
    const stamp = Date.now(),
      nextDay = new Date(stamp).toISOString().slice(0, 10);
    if (nextDay !== day || stamp - lastTick > 30 * 60 * 1000) {
      active = false;
      flush();
      sessionId = crypto.randomUUID();
      sequence = 0;
      counters = new Map();
      lastSection = undefined;
      day = nextDay;
      lastTick = stamp;
    }
    const wasActive = active;
    active =
      !document.hidden && document.hasFocus() && stamp - lastActivity < 120000;
    if (active) {
      const previous = lastSection ? counters.get(lastSection) : counter();
      if (previous)
        previous.seconds += Math.min(
          10,
          Math.max(0, (stamp - lastTick) / 1000),
        );
      counter();
    }
    lastTick = stamp;
    if (wasActive !== active || lastSentActive === undefined) flush();
  };
  const activity = () => {
    lastActivity = Date.now();
    tick();
  };
  const review = () => {
    if (kind === "user" && !stopped) {
      counter().reviews++;
      activity();
      flush();
    }
  };
  const sectionChanged = () => {
    tick();
    flush();
  };
  const visibility = () => {
    tick();
    flush();
  };
  const leave = () => {
    tick();
    active = false;
    flush(true);
  };
  for (const event of ["pointerdown", "keydown", "scroll", "touchstart"])
    window.addEventListener(event, activity, { passive: true });
  window.addEventListener("focus", activity);
  window.addEventListener("blur", visibility);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("pagehide", leave);
  window.addEventListener("itemstracker-review", review);
  window.addEventListener("itemstracker-section-change", sectionChanged);
  counter();
  tick();
  const timer = setInterval(tick, 5000),
    sender = setInterval(() => {
      if (active || lastSentActive !== active) flush();
    }, 30000);
  return () => {
    leave();
    stopped = true;
    clearInterval(timer);
    clearInterval(sender);
    for (const event of ["pointerdown", "keydown", "scroll", "touchstart"])
      window.removeEventListener(event, activity);
    window.removeEventListener("focus", activity);
    window.removeEventListener("blur", visibility);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("pagehide", leave);
    window.removeEventListener("itemstracker-review", review);
    window.removeEventListener("itemstracker-section-change", sectionChanged);
  };
}
