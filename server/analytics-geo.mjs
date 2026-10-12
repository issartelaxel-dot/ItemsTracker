import { open, Reader } from "maxmind";
import { access, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { isIP } from "node:net";

// Lookups stay on our server. Raw IP addresses are never persisted or exported.
export function createGeoLookup({
  path = process.env.GEOIP_DATABASE_PATH ||
    resolve("server/data/dbip-city-lite.mmdb"),
  download = process.env.ANALYTICS_GEO_DOWNLOAD !== "false",
} = {}) {
  let reader,
    pending,
    error = "",
    databaseDate = null;
  async function initialise() {
    try {
      await access(path);
    } catch {
      if (!download) throw new Error("Base géographique absente.");
      await mkdir(dirname(path), { recursive: true });
      let bytes;
      for (let months = 0; months < 3; months++) {
        const d = new Date();
        d.setUTCDate(1);
        d.setUTCMonth(d.getUTCMonth() - months);
        const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        const response = await fetch(
          `https://download.db-ip.com/free/dbip-city-lite-${month}.mmdb.gz`,
          { signal: AbortSignal.timeout(60000) },
        );
        if (response.status === 404) continue;
        if (!response.ok)
          throw new Error("Téléchargement géographique indisponible.");
        const compressed = Buffer.from(await response.arrayBuffer());
        if (compressed.length > 100_000_000)
          throw new Error("Base géographique trop volumineuse.");
        bytes = gunzipSync(compressed, { maxOutputLength: 250_000_000 });
        break;
      }
      if (!bytes) throw new Error("Base géographique indisponible.");
      const temporary = path + ".download";
      try {
        const nextReader=new Reader(bytes);
        await writeFile(temporary, bytes);
        await rename(temporary, path);
        reader=nextReader;
      } finally {
        await rm(temporary, { force: true });
      }
    }
    if (!reader) reader = await open(path);
    databaseDate = new Date((await stat(path)).mtime).toISOString();
    error = "";
  }
  return {
    start() {
      if (!pending)
        pending = initialise()
          .catch((e) => {
            error = e.message;
          })
          .finally(() => {
            pending = null;
          });
      return pending;
    },
    status: () => ({
      ready: Boolean(reader),
      loading: Boolean(pending),
      error,
      databaseDate,
      provider: "DB-IP Lite",
      attribution: "https://db-ip.com",
    }),
    lookup(rawIP) {
      const ip = String(rawIP || "").replace(/^::ffff:/, "");
      if (
        !isIP(ip) ||
        !reader ||
        /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/.test(
          ip,
        ) ||
        ip === "::1" ||
        /^(fc|fd|fe80:)/i.test(ip)
      )
        return null;
      const result = reader.get(ip);
      if (!result?.country?.iso_code) return null;
      const lat = result.location?.latitude,
        lon = result.location?.longitude;
      return {
        country: result.country.iso_code,
        city: result.city?.names?.fr || result.city?.names?.en || "",
        latitude: Number.isFinite(lat) ? Math.round(lat * 10) / 10 : null,
        longitude: Number.isFinite(lon) ? Math.round(lon * 10) / 10 : null,
      };
    },
  };
}
