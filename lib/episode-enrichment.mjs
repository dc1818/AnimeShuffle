const DAY = 86400000;
/** Page through episode flags in the background. Partial coverage is reported,
 * never extrapolated to a full-series filler rate. Episode titles are discarded.
 * Filler means the provider's flag, not an authoritative canon judgment. */
export function createEpisodeEnrichment({
  sql,
  schedule,
  fetcher = fetch,
  now = Date.now,
  dailyLimit = 150,
}) {
  sql.exec(
    "CREATE TABLE IF NOT EXISTS episode_taste (id INTEGER PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS episode_jobs (id INTEGER PRIMARY KEY, page INTEGER NOT NULL, priority INTEGER NOT NULL, ready INTEGER NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS episode_budget (id INTEGER PRIMARY KEY, day INTEGER NOT NULL, count INTEGER NOT NULL)",
  );
  const one = (q, ...args) => Array.from(sql.exec(q, ...args))[0];
  let running = false;
  const arm = async (at) => {
    try {
      await schedule(at);
    } catch {}
  };
  const cached = (id) => {
    try {
      const r = one(
        "SELECT value FROM episode_taste WHERE id=? AND expires>?",
        id,
        now(),
      );
      return r ? JSON.parse(r.value) : null;
    } catch {
      return null;
    }
  };
  const quotaReadyAt = () => {
    const day = Math.floor(now() / DAY),
      budget = one("SELECT day,count FROM episode_budget WHERE id=1");
    return budget?.day === day && budget.count >= dailyLimit
      ? (day + 1) * DAY
      : now() + 5000;
  };
  function attach(anime, priority = 0) {
    if (!Number.isSafeInteger(anime.id) || anime.id < 1) return anime;
    const data = cached(anime.id);
    // Concentrate requests on series. Movies and one-off shorts have no useful
    // episode-level filler ratio; unknown formats do not consume this queue.
    if (["tv", "ona"].includes(anime.format) && anime.episodes > 1 && !data)
      try {
        if (
          one("SELECT COUNT(*) AS n FROM episode_jobs").n < 150 ||
          one("SELECT id FROM episode_jobs WHERE id=?", anime.id)
        ) {
          sql.exec(
            "INSERT INTO episode_jobs VALUES (?,1,?,?) ON CONFLICT(id) DO UPDATE SET priority=MAX(priority,excluded.priority)",
            anime.id,
            priority,
            now(),
          );
          void arm(quotaReadyAt());
        }
      } catch {}
    return data ? { ...anime, episodeTaste: data } : anime;
  }
  async function run() {
    if (running) return;
    running = true;
    try {
      const day = Math.floor(now() / DAY),
        budget = one("SELECT day,count FROM episode_budget WHERE id=1");
      const count = budget?.day === day ? budget.count : 0;
      if (count >= dailyLimit) {
        if (one("SELECT id FROM episode_jobs LIMIT 1"))
          await arm((day + 1) * DAY);
        return;
      }
      const job = one(
        "SELECT * FROM episode_jobs WHERE ready<=? ORDER BY priority DESC,ready,id LIMIT 1",
        now(),
      );
      if (!job) return;
      sql.exec(
        "INSERT OR REPLACE INTO episode_budget VALUES (1,?,?)",
        day,
        count + 1,
      );
      try {
        const r = await fetcher(
          `https://api.tenrai.org/v1/anime/${job.id}/episodes?page=${job.page}`,
          {
            headers: { Accept: "application/json" },
            redirect: "manual",
            signal: AbortSignal.timeout(15000),
          },
        );
        if (!r.ok) {
          await r.body?.cancel();
          throw Error("episodes_http_" + r.status);
        }
        const reader = r.body.getReader();
        let bytes = 0;
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 512000) {
            await reader.cancel();
            throw Error("episodes_size");
          }
          chunks.push(value);
        }
        const body = JSON.parse(await new Blob(chunks).text());
        if (
          !Array.isArray(body.data) ||
          typeof body.pagination?.has_next_page !== "boolean"
        )
          throw Error("episodes_shape");
        const before =
          job.page === 1
            ? { total: 0, filler: 0, recap: 0, unknown: 0 }
            : cached(job.id);
        // If the cache expired mid-job, restart from page one rather than lose counts.
        if (!before) {
          sql.exec(
            "UPDATE episode_jobs SET page=1,ready=? WHERE id=?",
            now() + 5000,
            job.id,
          );
          return;
        }
        const episodes = [
          ...new Map(
            body.data
              .filter((e) => Number.isSafeInteger(e.mal_id))
              .map((e) => [e.mal_id, e]),
          ).values(),
        ];
        const total = before.total + episodes.length;
        const more = body.pagination?.has_next_page === true;
        const next = {
          total,
          filler:
            before.filler + episodes.filter((e) => e.filler === true).length,
          recap: before.recap + episodes.filter((e) => e.recap === true).length,
          unknown:
            before.unknown +
            episodes.filter((e) => typeof e.filler !== "boolean").length,
          complete:
            !more &&
            total > 0 &&
            before.unknown +
              episodes.filter((e) => typeof e.filler !== "boolean").length ===
              0,
          pages: job.page,
          source: "tenrai",
          checkedAt: now(),
        };
        sql.exec(
          "INSERT OR REPLACE INTO episode_taste VALUES (?,?,?)",
          job.id,
          JSON.stringify(next),
          now() + 7 * DAY,
        );
        sql.exec(
          "DELETE FROM episode_taste WHERE expires<? AND id NOT IN (SELECT id FROM episode_jobs)",
          now(),
        );
        sql.exec(
          "DELETE FROM episode_taste WHERE id IN (SELECT id FROM episode_taste WHERE id NOT IN (SELECT id FROM episode_jobs) ORDER BY expires DESC LIMIT -1 OFFSET 2000)",
        );
        if (more && episodes.length && job.page < 30)
          sql.exec(
            "UPDATE episode_jobs SET page=page+1,ready=? WHERE id=?",
            now() + 5000,
            job.id,
          );
        else sql.exec("DELETE FROM episode_jobs WHERE id=?", job.id);
      } catch (error) {
        sql.exec(
          "UPDATE episode_jobs SET ready=? WHERE id=?",
          now() + 3600000,
          job.id,
        );
      }
    } finally {
      running = false;
      const next = one("SELECT MIN(ready) AS at FROM episode_jobs");
      if (next?.at != null)
        await arm(Math.max(now() + 5000, next.at, quotaReadyAt()));
    }
  }
  const pending = one("SELECT MIN(ready) AS at FROM episode_jobs");
  if (pending?.at != null) void arm(Math.max(quotaReadyAt(), pending.at));
  return {
    attach,
    cached,
    run,
    diagnostics: () => ({
      queued: one("SELECT COUNT(*) AS n FROM episode_jobs").n,
      dailyLimit,
    }),
  };
}
