import { AsyncLocalStorage } from "node:async_hooks";
const DAY = 86400000;
const READ_LIMIT = 5000000,
  WRITE_LIMIT = 100000;
// Measures real cursor counters after consumption. No SQL text, bindings,
// account IDs, cookies, or query strings are stored in diagnostics.
export function createRowUsage(
  storage,
  { now = Date.now, backgroundReads = 3500000, backgroundWrites = 70000 } = {},
) {
  const raw = storage.sql,
    context = new AsyncLocalStorage();
  raw.exec(
    "CREATE TABLE IF NOT EXISTS database_usage (day INTEGER PRIMARY KEY, value TEXT NOT NULL)",
  );
  let day,
    data,
    lastFlush = 0,
    checkpointReads = 0,
    checkpointWrites = 0;
  const budgetReads = Math.max(
    0,
    Math.min(3500000, Number(backgroundReads) || 0),
  );
  const budgetWrites = Math.max(
    0,
    Math.min(70000, Number(backgroundWrites) || 0),
  );
  function load() {
    day = Math.floor(now() / DAY);
    const cursor = raw.exec(
      "SELECT value FROM database_usage WHERE day=?",
      day,
    );
    const row = Array.from(cursor)[0];
    data = row
      ? JSON.parse(row.value)
      : {
          startedAt: now(),
          rowsRead: 0,
          rowsWritten: 0,
          queries: 0,
          measured: false,
          groups: {},
        };
    record(cursor, "Meter / checkpoints");
    if (!row) {
      const cleanup = raw.exec(
        "DELETE FROM database_usage WHERE day<?",
        day - 14,
      );
      Array.from(cleanup);
      record(cleanup, "Meter / checkpoints");
    }
    checkpointReads = data.rowsRead;
    checkpointWrites = data.rowsWritten;
    lastFlush = 0;
  }
  function record(cursor, label) {
    const measured =
      Number.isFinite(cursor.rowsRead) && Number.isFinite(cursor.rowsWritten);
    data.measured ||= measured;
    const r = measured ? cursor.rowsRead : 0,
      w = measured ? cursor.rowsWritten : 0;
    data.rowsRead += r;
    data.rowsWritten += w;
    data.queries++;
    const group = (data.groups[label] ||= {
      rowsRead: 0,
      rowsWritten: 0,
      queries: 0,
    });
    group.rowsRead += r;
    group.rowsWritten += w;
    group.queries++;
  }
  function flush(force = false) {
    if (
      !data ||
      (!force &&
        now() - lastFlush < 60000 &&
        data.rowsRead - checkpointReads < 10000 &&
        data.rowsWritten - checkpointWrites < 1000)
    )
      return;
    const cursor = raw.exec(
      "INSERT OR REPLACE INTO database_usage VALUES (?,?)",
      day,
      JSON.stringify({ ...data, checkpointAt: now() }),
    );
    Array.from(cursor);
    record(cursor, "Meter / checkpoints");
    checkpointReads = data.rowsRead;
    checkpointWrites = data.rowsWritten;
    lastFlush = now();
  }
  function rollover() {
    if (day === Math.floor(now() / DAY)) return;
    flush(true);
    load();
  }
  load();
  const measuredSql = {
    exec(query, ...bindings) {
      rollover();
      const cursor = raw.exec(query, ...bindings);
      const rows = Array.from(cursor);
      const table =
        query.match(/\b(?:FROM|INTO|UPDATE|JOIN)\s+([a-z_]+)/i)?.[1] ||
        "schema";
      const label = `${context.getStore() || "Startup"} · ${table.toLowerCase()}`;
      record(cursor, label);
      return rows;
    },
  };
  const wrapped = new Proxy(storage, {
    get(target, key) {
      if (key === "sql") return measuredSql;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  function allowed() {
    rollover();
    return data.rowsRead < budgetReads && data.rowsWritten < budgetWrites;
  }
  return {
    storage: wrapped,
    flush,
    allowed,
    run: (label, task) => context.run(label, task),
    diagnostics() {
      rollover();
      return {
        ...data,
        groups: Object.entries(data.groups)
          .map(([label, counts]) => ({ label, ...counts }))
          .sort((a, b) => b.rowsRead - a.rowsRead)
          .slice(0, 15),
        readLimit: READ_LIMIT,
        writeLimit: WRITE_LIMIT,
        backgroundReadLimit: budgetReads,
        backgroundWriteLimit: budgetWrites,
        backgroundPaused: !allowed(),
        resetsAt: (day + 1) * DAY,
        checkpointAt: lastFlush || data.checkpointAt || null,
        scope:
          "Observed SQL for this Anime Shuffle backend only. Excludes other Cloudflare services and unmetered storage APIs. Counters start at installation; recent uncheckpointed usage can be lost on restart. Not an account-wide balance.",
      };
    },
  };
}
export function usageRoute(request) {
  const path = new URL(request.url).pathname;
  if (/^\/api\/(session|list|catalog|search|taste|profile)$/.test(path))
    return path;
  if (path.startsWith("/api/admin/")) return "Admin";
  if (path.startsWith("/api/account/")) return "Account";
  if (/^\/api\/(anime|trailer|pictures)\//.test(path))
    return "/api/" + path.split("/")[2] + "/*";
  return "Other requests";
}
