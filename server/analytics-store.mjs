import { randomUUID } from "node:crypto";
import { z } from "zod";
export const sections = [
  "dashboard",
  "items",
  "flashcards",
  "colleges",
  "calendar",
  "settings",
  "stats",
  "revision",
  "sales",
];
export const pulseSchema = z
  .object({
    sessionId: z.string().uuid(),
    visitorId: z.string().uuid().optional(),
    kind: z.enum(["user", "visitor"]),
    sequence: z.number().int().min(0).max(1_000_000),
    section: z.enum(sections),
    active: z.boolean(),
    sections: z
      .array(
        z
          .object({
            section: z.enum(sections),
            seconds: z.number().int().min(0).max(86400),
            reviews: z.number().int().min(0).max(10000),
            visits: z.number().int().min(0).max(10000),
          })
          .strict(),
      )
      .max(9),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.sections.map((s) => s.section)).size !== v.sections.length ||
      v.sections.reduce((sum, s) => sum + s.seconds, 0) > 86400 ||
      (v.kind === "visitor" &&
        (!v.visitorId ||
          v.section !== "sales" ||
          v.sections.some((s) => s.section !== "sales" || s.reviews)))
    )
      ctx.addIssue({ code: "custom", message: "Mesure invalide." });
  });
export class AnalyticsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function createAnalyticsStore(pool, { now = () => new Date() } = {}) {
  async function init() {
    await pool.query(`
 CREATE TABLE IF NOT EXISTS analytics_users(user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, pseudonym UUID NOT NULL UNIQUE);
 CREATE TABLE IF NOT EXISTS analytics_sessions(id UUID PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('user','visitor')), user_id BIGINT REFERENCES users(id) ON DELETE CASCADE, visitor_id UUID,
 started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(), active BOOLEAN NOT NULL DEFAULT FALSE, section TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT -1, snapshot JSONB NOT NULL DEFAULT '[]', country TEXT, city TEXT, latitude REAL, longitude REAL,
 CHECK((kind='user' AND user_id IS NOT NULL AND visitor_id IS NULL) OR (kind='visitor' AND user_id IS NULL AND visitor_id IS NOT NULL)));
 CREATE TABLE IF NOT EXISTS analytics_session_sections(session_id UUID REFERENCES analytics_sessions(id) ON DELETE CASCADE, section TEXT NOT NULL, active_seconds INTEGER NOT NULL DEFAULT 0, reviews INTEGER NOT NULL DEFAULT 0, visits INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(session_id,section));
 CREATE INDEX IF NOT EXISTS analytics_sessions_date ON analytics_sessions(started_at);
 CREATE INDEX IF NOT EXISTS analytics_sessions_live ON analytics_sessions(last_seen) WHERE active;
 CREATE INDEX IF NOT EXISTS analytics_sessions_user ON analytics_sessions(user_id,started_at DESC);
 CREATE TABLE IF NOT EXISTS analytics_metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);
 INSERT INTO analytics_metadata(key,value) VALUES('startedAt',NOW()::text) ON CONFLICT DO NOTHING;
 `);
  }
  async function purge() {
    await pool.query(
      "DELETE FROM analytics_sessions WHERE started_at < NOW() - INTERVAL '12 months'",
    );
  }
  async function pulse(input, uid, geo) {
    const data = pulseSchema.parse(input),
      stamp = now(),
      db = await pool.connect();
    try {
      await db.query("BEGIN");
      if (data.kind === "user") {
        if (!uid) throw new AnalyticsError(401, "Session requise.");
        await db.query(
          "INSERT INTO analytics_users(user_id,pseudonym) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [uid, randomUUID()],
        );
      }
      await db.query(
        `INSERT INTO analytics_sessions(id,kind,user_id,visitor_id,started_at,last_seen,section) VALUES($1,$2,$3,$4,$5,$5,$6) ON CONFLICT DO NOTHING`,
        [
          data.sessionId,
          data.kind,
          data.kind === "user" ? uid : null,
          data.kind === "visitor" ? data.visitorId : null,
          stamp,
          data.section,
        ],
      );
      const {
        rows: [prior],
      } = await db.query(
        "SELECT * FROM analytics_sessions WHERE id=$1 FOR UPDATE",
        [data.sessionId],
      );
      if (
        prior.kind !== data.kind ||
        (data.kind === "user"
          ? Number(prior.user_id) !== uid
          : prior.visitor_id !== data.visitorId)
      )
        throw new AnalyticsError(403, "Session invalide.");
      if (data.sequence <= prior.sequence) {
        await db.query("COMMIT");
        return;
      }
      const previous = new Map(prior.snapshot.map((s) => [s.section, s])),
        elapsed =
          prior.sequence < 0
            ? 35
            : Math.max(0, (stamp - new Date(prior.last_seen)) / 1000) + 5;
      const deltas = data.sections.map((s) => {
        const p = previous.get(s.section);
        return {
          ...s,
          delta: Math.max(0, s.seconds - (p?.seconds || 0)),
          deltaReviews: Math.max(0, s.reviews - (p?.reviews || 0)),
          deltaVisits: Math.max(0, s.visits - (p?.visits || 0)),
        };
      });
      const total = deltas.reduce((sum, s) => sum + s.delta, 0),
        factor = total ? Math.min(1, elapsed / total) : 1;
      // Cumulative counters make retries/reordered requests harmless. Bound time by server elapsed time.
      for (const s of deltas)
        await db.query(
          `INSERT INTO analytics_session_sections(session_id,section,active_seconds,reviews,visits) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,section) DO UPDATE SET active_seconds=analytics_session_sections.active_seconds+EXCLUDED.active_seconds,reviews=analytics_session_sections.reviews+EXCLUDED.reviews,visits=analytics_session_sections.visits+EXCLUDED.visits`,
          [
            data.sessionId,
            s.section,
            Math.floor(s.delta * factor),
            Math.min(100, s.deltaReviews),
            Math.min(100, s.deltaVisits),
          ],
        );
      // Never move snapshot counters backwards, even after malformed clients/retries.
      const snapshot = [
        ...new Set([
          ...previous.keys(),
          ...data.sections.map((s) => s.section),
        ]),
      ].map((section) => {
        const a = previous.get(section),
          b = data.sections.find((s) => s.section === section);
        return {
          section,
          seconds: Math.max(a?.seconds || 0, b?.seconds || 0),
          reviews: Math.max(a?.reviews || 0, b?.reviews || 0),
          visits: Math.max(a?.visits || 0, b?.visits || 0),
        };
      });
      await db.query(
        `UPDATE analytics_sessions SET last_seen=$2,active=$3,section=$4,sequence=$5,snapshot=$6,country=COALESCE(country,$7),city=COALESCE(city,$8),latitude=COALESCE(latitude,$9),longitude=COALESCE(longitude,$10) WHERE id=$1`,
        [
          data.sessionId,
          stamp,
          data.active,
          data.section,
          data.sequence,
          JSON.stringify(snapshot),
          geo?.country || null,
          geo?.city || null,
          geo?.latitude ?? null,
          geo?.longitude ?? null,
        ],
      );
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  const entitySQL = `CASE WHEN s.kind='user' THEN 'USR-'||UPPER(REPLACE(a.pseudonym::text,'-','')) ELSE 'VIS-'||UPPER(REPLACE(s.visitor_id::text,'-','')) END`;
  async function overview({
    days = 30,
    kind = "all",
    country = "",
    city = "",
    timeZone = "Europe/Paris",
    live = false,
    search = "",
    page = 1,
    limit = 50,
    entityKind = "all",
    allAccounts = false,
  } = {}) {
    await pool.query(
      "INSERT INTO analytics_users(user_id,pseudonym) SELECT id,gen_random_uuid() FROM users ON CONFLICT DO NOTHING",
    );
    const stamp = now();
    const {
      rows: [range],
    } = await pool.query(
      "SELECT (DATE_TRUNC('day',$1::timestamptz AT TIME ZONE $2)-($3::int-1)*INTERVAL '1 day') AT TIME ZONE $2 AS since",
      [stamp, timeZone, days],
    );
    const since = range.since;
    const args = [
      since,
      kind,
      country,
      city,
      stamp,
      timeZone,
      live,
      search,
      Math.max(0, page - 1) * limit,
      limit,
      entityKind,
      allAccounts && !live && !country && !city,
    ];
    const base = `WITH filtered AS (SELECT s.*,${entitySQL} entity FROM analytics_sessions s LEFT JOIN analytics_users a ON a.user_id=s.user_id WHERE s.started_at >= $1 AND ($2='all' OR s.kind=$2) AND ($3='' OR COALESCE(s.country,'')=$3) AND ($4='' OR COALESCE(s.city,'')=$4) AND (NOT $7::boolean OR (s.active AND s.last_seen>$5::timestamptz-INTERVAL '90 seconds'))), totals AS (SELECT s.*,COALESCE(t.seconds,0)::int seconds,COALESCE(t.reviews,0)::int reviews FROM filtered s LEFT JOIN LATERAL(SELECT SUM(active_seconds) seconds,SUM(reviews) reviews FROM analytics_session_sections WHERE session_id=s.id)t ON true)`;
    // Each query uses only the parameters it needs; unused SQL parameters must still be typed.
    const query = async (sql, params) => (await pool.query(sql, params)).rows;
    const shared = args.slice(0, 7);
    const typed = base.replace(
      "WITH filtered AS",
      "WITH config AS (SELECT $6::text zone), filtered AS",
    );
    const listed = `${typed}, listing_config AS(SELECT $9::int off,$10::int lim), grouped AS(SELECT entity,kind,MAX(last_seen) last_seen,COUNT(*)::int sessions,SUM(seconds)::float8 seconds,SUM(reviews)::int reviews,BOOL_OR(active AND last_seen>$5::timestamptz-INTERVAL '90 seconds') live,(ARRAY_AGG(section ORDER BY last_seen DESC))[1] section,(ARRAY_AGG(country ORDER BY last_seen DESC))[1] country,(ARRAY_AGG(city ORDER BY last_seen DESC))[1] city FROM totals WHERE ($11='all' OR kind=$11) GROUP BY entity,kind), listed AS(SELECT * FROM grouped UNION ALL SELECT 'USR-'||UPPER(REPLACE(a.pseudonym::text,'-','')), 'user',NULL::timestamptz,0,0,0,FALSE,'',NULL,NULL FROM analytics_users a WHERE $12::boolean AND NOT EXISTS(SELECT 1 FROM grouped g WHERE g.entity='USR-'||UPPER(REPLACE(a.pseudonym::text,'-',''))))`;
    const [
      metrics,
      daily,
      locations,
      sectionRows,
      users,
      totalRows,
      registered,
      meta,
    ] = await Promise.all([
      query(
        `${typed} SELECT COUNT(*)::int sessions,COUNT(DISTINCT entity) FILTER(WHERE kind='user')::int users,COUNT(DISTINCT entity) FILTER(WHERE kind='visitor')::int visitors,COUNT(DISTINCT entity) FILTER(WHERE kind='user' AND (last_seen AT TIME ZONE $6)::date=($5::timestamptz AT TIME ZONE $6)::date)::int active_today,COUNT(DISTINCT entity) FILTER(WHERE active AND last_seen>$5::timestamptz-INTERVAL '90 seconds' AND kind='user')::int live_users,COUNT(DISTINCT entity) FILTER(WHERE active AND last_seen>$5::timestamptz-INTERVAL '90 seconds' AND kind='visitor')::int live_visitors,COALESCE(SUM(seconds),0)::float8 active_seconds,COALESCE(SUM(seconds) FILTER(WHERE kind='user'),0)::float8 user_active_seconds,COALESCE(SUM(seconds) FILTER(WHERE kind='visitor'),0)::float8 visitor_active_seconds,COUNT(*) FILTER(WHERE kind='user')::int user_sessions,COUNT(*) FILTER(WHERE kind='visitor')::int visitor_sessions,COUNT(DISTINCT entity) FILTER(WHERE kind='visitor' AND (last_seen AT TIME ZONE $6)::date=($5::timestamptz AT TIME ZONE $6)::date)::int visitors_today,COALESCE(SUM(reviews),0)::int reviews,COUNT(*) FILTER(WHERE country IS NULL)::int unknown_locations FROM totals`,
        shared,
      ),
      query(
        `${typed} SELECT TO_CHAR(started_at AT TIME ZONE $6,'YYYY-MM-DD') AS "day",COUNT(DISTINCT entity) FILTER(WHERE kind='user')::int users,COUNT(DISTINCT entity) FILTER(WHERE kind='visitor')::int visitors FROM totals GROUP BY 1 ORDER BY 1`,
        shared,
      ),
      query(
        `${typed} SELECT COALESCE(country,'') country,COALESCE(city,'') city,latitude,longitude,COUNT(DISTINCT entity) FILTER(WHERE kind='user')::int users,COUNT(DISTINCT entity) FILTER(WHERE kind='visitor')::int visitors FROM totals GROUP BY 1,2,3,4 ORDER BY (COUNT(DISTINCT entity)) DESC LIMIT 500`,
        shared,
      ),
      query(
        `${typed} SELECT t.section,SUM(t.active_seconds)::int seconds,SUM(t.reviews)::int reviews,SUM(t.visits)::int visits FROM analytics_session_sections t JOIN filtered s ON s.id=t.session_id GROUP BY t.section ORDER BY seconds DESC`,
        shared,
      ),
      query(
        `${listed} SELECT * FROM listed WHERE entity ILIKE '%'||$8||'%' ORDER BY last_seen DESC NULLS LAST,entity OFFSET $9 LIMIT $10`,
        args,
      ),
      query(
        `${listed} SELECT COUNT(*)::int count FROM listed WHERE entity ILIKE '%'||$8||'%'`,
        args,
      ),
      query(
        `SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE created_at::timestamptz >= $1)::int new FROM users`,
        [since],
      ),
      query("SELECT value FROM analytics_metadata WHERE key='startedAt' ", []),
    ]);
    const registrations = await query(
      `SELECT TO_CHAR(created_at::timestamptz AT TIME ZONE $2,'YYYY-MM-DD') AS "day",COUNT(*)::int registrations FROM users WHERE created_at::timestamptz >= $1 GROUP BY 1 ORDER BY 1`,
      [since, timeZone],
    );
    const daysMap = new Map(daily.map((d) => [d.day, d]));
    for (const d of registrations)
      daysMap.set(d.day, {
        users: 0,
        visitors: 0,
        ...daysMap.get(d.day),
        ...d,
      });
    return {
      metrics: {
        ...metrics[0],
        registered: registered[0].total,
        newRegistrations: registered[0].new,
      },
      daily: [...daysMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
      locations,
      sections: sectionRows,
      users,
      totalEntities: totalRows[0].count,
      page,
      limit,
      startedAt: meta[0]?.value,
      updatedAt: stamp.toISOString(),
      days,
      live,
      geographicFilter: { country, city },
    };
  }
  async function detail(entity, { days = 30 } = {}) {
    if (!/^(USR|VIS)-[A-F0-9]{32}$/.test(entity))
      throw new AnalyticsError(400, "Identifiant invalide.");
    const since = new Date(now());
    since.setUTCDate(since.getUTCDate() - days);
    const { rows } = await pool.query(
      `SELECT s.id,s.kind,s.started_at,s.last_seen,s.section,s.active,s.country,s.city,COALESCE(SUM(t.active_seconds),0)::int seconds,COALESCE(SUM(t.reviews),0)::int reviews,COALESCE(jsonb_agg(jsonb_build_object('section',t.section,'seconds',t.active_seconds,'reviews',t.reviews,'visits',t.visits)) FILTER(WHERE t.section IS NOT NULL),'[]') sections FROM analytics_sessions s LEFT JOIN analytics_users a ON a.user_id=s.user_id LEFT JOIN analytics_session_sections t ON t.session_id=s.id WHERE ${entitySQL}=$1 AND s.started_at >= $2 GROUP BY s.id ORDER BY s.started_at DESC LIMIT 200`,
      [entity, since],
    );
    if (!rows.length) {
      const { rows: known } = await pool.query(
        "SELECT 1 FROM analytics_users WHERE 'USR-'||UPPER(REPLACE(pseudonym::text,'-',''))=$1",
        [entity],
      );
      if (!known.length)
        throw new AnalyticsError(404, "Aucune session sur cette période.");
    }
    return { entity, sessions: rows, days };
  }
  return { init, purge, pulse, overview, detail };
}
