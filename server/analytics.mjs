import { pulseSchema, AnalyticsError } from "./analytics-store.mjs";
export function mountAnalytics(
  app,
  {
    store,
    pool,
    authenticate,
    adminEmails,
    limiter,
    geo,
    allowedOrigins = new Set(),
  },
) {
  const signedIn = (req, res, next) => {
    const auth = authenticate(req);
    const uid = Number(auth?.uid);
    if (!Number.isSafeInteger(uid) || uid < 1)
      return res.status(401).json({ error: "Connecte-toi à ItemsTracker." });
    req.analyticsUid = uid;
    next();
  };
  const admin = async (req, res, next) => {
    try {
      const { rows } = await pool.query("SELECT email FROM users WHERE id=$1", [
        req.analyticsUid,
      ]);
      if (!rows[0] || !adminEmails.includes(rows[0].email.toLowerCase()))
        return res
          .status(403)
          .json({ error: "Accès réservé aux administrateurs." });
      next();
    } catch (e) {
      next(e);
    }
  };
  app.use(["/api/admin/analytics", "/api/analytics"], (_req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  });
  app.post("/api/analytics/pulse", limiter, async (req, res, next) => {
    try {
      if (
        req.get("origin") &&
        allowedOrigins.size &&
        !allowedOrigins.has(req.get("origin"))
      )
        return res.status(403).json({ error: "Origine invalide." });
      if (/bot|crawl|spider|headless/i.test(req.get("user-agent") || ""))
        return res.status(204).end();
      const parsed = pulseSchema.safeParse(req.body);
      if (!parsed.success)
        return res.status(400).json({ error: "Mesure invalide." });
      const data = parsed.data;
      let uid = null;
      if (data.kind === "user") {
        uid = Number(authenticate(req)?.uid);
        if (!Number.isSafeInteger(uid) || uid < 1)
          return res.status(401).json({ error: "Session requise." });
        const { rows } = await pool.query(
          "SELECT email FROM users WHERE id=$1",
          [uid],
        );
        if (!rows[0])
          return res.status(401).json({ error: "Session invalide." });
        if (adminEmails.includes(rows[0].email.toLowerCase()))
          return res.json({ ok: true, disabled: true });
      }
      // Render forwards the visitor IP before its proxy IPs. Use it only for
      // approximate geography; never for authentication or rate limiting.
      const visitorIp = req.get("x-forwarded-for")?.split(",")[0]?.trim() || req.ip;
      await store.pulse(data, uid, geo.lookup(visitorIp));
      res.json({ ok: true });
    } catch (e) {
      if (e instanceof AnalyticsError)
        return res.status(e.status).json({ error: e.message });
      next(e);
    }
  });
  const params = (req) => {
    const entityKind = String(req.query.entityKind || "all");
    if (!["all", "user", "visitor"].includes(entityKind))
      throw new AnalyticsError(400, "Filtres invalides.");
    const days = Number(req.query.days || 30),
      kind = String(req.query.kind || "all"),
      page = Number(req.query.page || 1),
      limit = Number(req.query.limit || 50),
      country = String(req.query.country || ""),
      city = String(req.query.city || ""),
      search = String(req.query.search || "").slice(0, 80),
      timeZone = String(req.query.timeZone || "Europe/Paris");
    if (
      ![1, 7, 30, 90, 365].includes(days) ||
      !["all", "user", "visitor"].includes(kind) ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 100000 ||
      ![5, 25, 50, 100].includes(limit) ||
      !/^([A-Z]{2})?$/.test(country) ||
      city.length > 120
    )
      throw new AnalyticsError(400, "Filtres invalides.");
    try {
      new Intl.DateTimeFormat("fr", { timeZone }).format();
    } catch {
      throw new AnalyticsError(400, "Fuseau horaire invalide.");
    }
    return {
      days,
      kind,
      country,
      city,
      page,
      limit,
      search,
      timeZone,
      entityKind,
      allAccounts: req.query.allAccounts === "true",
      live: req.query.live === "true",
    };
  };
  app.get(
    "/api/admin/analytics",
    limiter,
    signedIn,
    admin,
    async (req, res, next) => {
      try {
        res.json({ ...(await store.overview(params(req))), geo: geo.status() });
      } catch (e) {
        if (e instanceof AnalyticsError)
          return res.status(e.status).json({ error: e.message });
        next(e);
      }
    },
  );
  app.get(
    "/api/admin/analytics/entities/:entity",
    limiter,
    signedIn,
    admin,
    async (req, res, next) => {
      try {
        res.json(await store.detail(req.params.entity, params(req)));
      } catch (e) {
        if (e instanceof AnalyticsError)
          return res.status(e.status).json({ error: e.message });
        next(e);
      }
    },
  );
}
