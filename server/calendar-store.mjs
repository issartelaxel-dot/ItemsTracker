import crypto from "node:crypto";
import {
  CalendarError,
  normalizeEvent,
  toICS,
  fromICS,
} from "./calendar-model.mjs";
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
export function createCalendarStore(pool) {
  async function init() {
    await pool.query(`CREATE TABLE IF NOT EXISTS app_calendars (user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, revision BIGINT NOT NULL DEFAULT 0, time_zone TEXT NOT NULL DEFAULT 'UTC');
      CREATE TABLE IF NOT EXISTS app_calendar_events (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, id TEXT NOT NULL, uid TEXT NOT NULL, data JSONB NOT NULL, ical TEXT NOT NULL, etag TEXT NOT NULL, revision BIGINT NOT NULL, deleted BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,id));
      CREATE UNIQUE INDEX IF NOT EXISTS calendar_uid_unique ON app_calendar_events(user_id,uid) WHERE deleted=FALSE;
      CREATE TABLE IF NOT EXISTS app_calendar_devices (id TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, label TEXT NOT NULL, secret_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), last_used_at TIMESTAMPTZ, revoked BOOLEAN NOT NULL DEFAULT FALSE);
      CREATE TABLE IF NOT EXISTS app_calendar_reminder_reads (user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,event_id TEXT NOT NULL, etag TEXT NOT NULL, read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY(user_id,event_id,etag));`);
  }
  async function account(uid) {
    await pool.query(
      "INSERT INTO app_calendars(user_id) VALUES($1) ON CONFLICT DO NOTHING",
      [uid],
    );
    return (
      await pool.query("SELECT * FROM app_calendars WHERE user_id=$1", [uid])
    ).rows[0];
  }
  async function list(uid, { deleted = false, since = 0, until = null } = {}) {
    return (
      await pool.query(
        "SELECT * FROM app_calendar_events WHERE user_id=$1 AND ($2 OR NOT deleted) AND revision>$3 AND ($4::bigint IS NULL OR revision<=$4) ORDER BY revision",
        [uid, deleted, since, until],
      )
    ).rows;
  }
  async function get(uid, id) {
    return (
      (
        await pool.query(
          "SELECT * FROM app_calendar_events WHERE user_id=$1 AND id=$2 AND NOT deleted",
          [uid, id],
        )
      ).rows[0] || null
    );
  }
  async function mutate(
    uid,
    id,
    input,
    {
      match = null,
      createOnly = false,
      remove = false,
      ics = false,
      requireMatch = false,
    } = {},
  ) {
    await account(uid);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const a = (
        await client.query(
          "SELECT * FROM app_calendars WHERE user_id=$1 FOR UPDATE",
          [uid],
        )
      ).rows[0];
      const previous = (
        await client.query(
          "SELECT * FROM app_calendar_events WHERE user_id=$1 AND id=$2 AND NOT deleted",
          [uid, id],
        )
      ).rows[0];
      if (
        (createOnly && previous) ||
        (match && (!previous || (match !== "*" && match !== previous.etag)))
      )
        throw new CalendarError(
          412,
          "La séance a changé depuis son ouverture. Recharge pour conserver les modifications des deux côtés.",
        );
      if (requireMatch && previous && !match)
        throw new CalendarError(
          428,
          "Recharge cette séance avant de la modifier.",
        );
      if (remove && !previous)
        throw new CalendarError(404, "Séance introuvable.");
      if (!previous && !remove) {
        const count = (
          await client.query(
            "SELECT count(*) FROM app_calendar_events WHERE user_id=$1 AND NOT deleted",
            [uid],
          )
        ).rows[0].count;
        if (Number(count) >= 2000)
          throw new CalendarError(409, "Limite de 2 000 séances atteinte.");
      }
      const revision = Number(a.revision) + 1;
      let row = null;
      if (remove) {
        await client.query(
          "UPDATE app_calendar_events SET deleted=TRUE,revision=$3,updated_at=NOW() WHERE user_id=$1 AND id=$2",
          [uid, id, revision],
        );
      } else {
        const parsed = ics
          ? fromICS(input, id, previous?.data, a.time_zone)
          : {
              data: normalizeEvent({ ...input, id }, previous?.data),
              uid: previous?.uid || id + "@itemstracker",
            };
        if (previous && parsed.uid !== previous.uid)
          throw new CalendarError(
            409,
            "L’identifiant de cette séance ne peut pas changer.",
          );
        const raw = ics ? input : toICS(parsed.data, previous?.ical),
          etag = '"' + crypto.randomUUID() + '"';
        row = (
          await client.query(
            `INSERT INTO app_calendar_events(user_id,id,uid,data,ical,etag,revision) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,id) DO UPDATE SET uid=$3,data=$4,ical=$5,etag=$6,revision=$7,deleted=FALSE,updated_at=NOW() RETURNING *`,
            [
              uid,
              id,
              parsed.uid,
              JSON.stringify(parsed.data),
              raw,
              etag,
              revision,
            ],
          )
        ).rows[0];
      }
      await client.query(
        "UPDATE app_calendars SET revision=$2 WHERE user_id=$1",
        [uid, revision],
      );
      await client.query("COMMIT");
      return { row, created: !previous };
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code === "23505")
        throw new CalendarError(
          409,
          "Cette séance existe déjà dans le calendrier.",
        );
      throw e;
    } finally {
      client.release();
    }
  }
  async function devices(uid) {
    return (
      await pool.query(
        "SELECT id,label,created_at,last_used_at FROM app_calendar_devices WHERE user_id=$1 AND NOT revoked ORDER BY created_at DESC",
        [uid],
      )
    ).rows;
  }
  async function issue(uid, label, zone) {
    if ((await devices(uid)).length >= 16)
      throw new CalendarError(
        409,
        "Révoque un appareil avant d’en ajouter un autre.",
      );
    await account(uid);
    if (zone) {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
      } catch {
        throw new CalendarError(400, "Fuseau invalide.");
      }
      await pool.query(
        "UPDATE app_calendars SET time_zone=$2 WHERE user_id=$1",
        [uid, zone],
      );
    }
    const id = crypto.randomUUID(),
      secret = crypto.randomBytes(32).toString("base64url"),
      password = "itcal_" + id + "." + secret;
    await pool.query(
      "INSERT INTO app_calendar_devices(id,user_id,label,secret_hash) VALUES($1,$2,$3,$4)",
      [id, uid, label, hash(secret)],
    );
    const username = (
      await pool.query("SELECT email FROM users WHERE id=$1", [uid])
    ).rows[0].email;
    return { id, password, username };
  }
  async function authenticate(username, password) {
    const match = /^itcal_([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/.exec(
      password || "",
    );
    if (!match) return null;
    const row = (
      await pool.query(
        "SELECT d.*,u.email FROM app_calendar_devices d JOIN users u ON u.id=d.user_id WHERE d.id=$1 AND NOT d.revoked",
        [match[1]],
      )
    ).rows[0];
    if (
      !row ||
      row.email.toLowerCase() !== username.toLowerCase() ||
      !crypto.timingSafeEqual(
        Buffer.from(hash(match[2]), "hex"),
        Buffer.from(row.secret_hash, "hex"),
      )
    )
      return null;
    await pool.query(
      "UPDATE app_calendar_devices SET last_used_at=NOW() WHERE id=$1 AND (last_used_at IS NULL OR last_used_at<NOW()-INTERVAL '10 minutes')",
      [row.id],
    );
    return row.user_id;
  }
  async function revoke(uid, id) {
    await pool.query(
      "UPDATE app_calendar_devices SET revoked=TRUE WHERE user_id=$1 AND id=$2",
      [uid, id],
    );
  }
  async function reminders(uid) {
    return (
      await pool.query(
        `SELECT e.id,e.etag,e.data,r.read_at FROM app_calendar_events e LEFT JOIN app_calendar_reminder_reads r ON r.user_id=e.user_id AND r.event_id=e.id AND r.etag=e.etag
      WHERE e.user_id=$1 AND NOT e.deleted AND NOT (e.data->>'completed')::boolean AND e.data->>'reminderMinutes' IS NOT NULL
      AND (e.data->>'startAt')::timestamptz - (e.data->>'reminderMinutes')::int * INTERVAL '1 minute' <= NOW()
      AND (e.data->>'endAt')::timestamptz > NOW() ORDER BY e.data->>'startAt' LIMIT 100`,
        [uid],
      )
    ).rows;
  }
  async function readReminders(uid, ids) {
    await pool.query(
      `INSERT INTO app_calendar_reminder_reads(user_id,event_id,etag) SELECT user_id,id,etag FROM app_calendar_events WHERE user_id=$1 AND id=ANY($2::text[]) AND NOT deleted ON CONFLICT DO NOTHING`,
      [uid, ids],
    );
  }
  return {
    init,
    account,
    list,
    get,
    mutate,
    devices,
    issue,
    authenticate,
    revoke,
    reminders,
    readReminders,
  };
}
