import { readFile, mkdir, open, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { createHash } from "node:crypto";
import {
  createOfficialTraitApi,
  createDiskApiCache,
  saveJson,
  TraitApiError,
} from "../lib/official-trait-api.mjs";
import {
  readAnimeInput,
  validateMappings,
  mapApiTraits,
  mappingCoverage,
} from "../lib/api-trait-import.mjs";

export async function runApiTraitBatch({
  entries,
  api,
  mappings,
  output,
  shouldStop = () => false,
  onProgress = () => {},
}) {
  const profiles = [],
    reports = [];
  const coverage = mappingCoverage(mappings);
  const startedAt = new Date().toISOString();
  let interrupted = false;
  async function checkpoint() {
    const report = {
      format: "anime-shuffle-api-trait-report",
      schemaVersion: 1,
      startedAt,
      updatedAt: new Date().toISOString(),
      mappingsVersion: mappings.version,
      mappingsHash: createHash("sha256")
        .update(JSON.stringify(mappings))
        .digest("hex"),
      inputTitles: entries.length,
      processedTitles: reports.length,
      importableProfiles: profiles.length,
      pendingIds: entries.slice(reports.length).map((r) => r.malId),
      failedTitles: reports.filter((r) => r.errors.length).length,
      interrupted,
      apiStats: api.stats,
      coverage,
      titles: reports,
    };
    // Empty results are deliberately not disguised as a valid research upload.
    await saveJson(
      join(output, "research-results.json"),
      profiles.length
        ? { format: "anime-shuffle-research", schemaVersion: 1, profiles }
        : {
            format: "anime-shuffle-api-no-matches",
            uploadReady: false,
            profiles: [],
            note: "No supported mappings yet. See coverage-report.json.",
          },
    );
    await saveJson(join(output, "coverage-report.json"), report);
    return report;
  }
  for (const entry of entries) {
    if (shouldStop()) {
      interrupted = true;
      break;
    }
    const results = [],
      errors = [];
    let stop = false;
    for (const provider of ["mal", ...(entry.tmdb ? ["tmdb"] : [])]) {
      try {
        results.push(
          await api[provider](provider === "mal" ? entry.malId : entry.tmdb),
        );
      } catch (error) {
        if (!(error instanceof TraitApiError)) throw error;
        errors.push({ provider, code: error.code, status: error.status });
        if (provider === "mal" && error.stopProvider) {
          stop = true;
          break;
        }
      }
    }
    const { profile, report } = mapApiTraits(entry, results, mappings);
    if (profile) profiles.push(profile);
    reports.push({
      ...report,
      ...(results.length ? {} : { state: "api_failed" }),
      errors,
    });
    onProgress({
      processed: reports.length,
      total: entries.length,
      malId: entry.malId,
      matches: profile?.observations.length || 0,
      errors,
    });
    // Successful responses are atomically cached immediately; exports checkpoint every ten titles.
    if (reports.length % 10 === 0 || stop) await checkpoint();
    if (stop) {
      interrupted = true;
      break;
    }
  }
  return checkpoint();
}

const HELP = `Official API trait importer (use Node 24+; no LLM or scraping)

npm run traits:api -- --input catalog.json
npm run traits:api -- --ids 1,5,20 --output .data/api-traits/pilot

--input FILE       Admin catalog export, work queue, or JSON array of MAL IDs
--ids LIST         Comma-separated MAL IDs (use this OR --input)
--output DIR       Default: .data/api-traits
--mappings FILE    Additional reviewed mapping rules; same shape as data/api-trait-mappings.json
--offline          Re-map cached API responses without network access or credentials
--refresh          Refresh responses even when the seven-day cache is fresh
--help             Show this help

Set MAL_CLIENT_ID in .env. Optional TMDB_READ_TOKEN for explicitly supplied TMDB links.
Re-run the same command after interruption; cached titles need no new requests.
Upload research-results.json in Admin only when the report has importable profiles.
Detailed setup: docs/api-trait-importer.md
`;

export async function main(args = process.argv.slice(2), env = process.env) {
  const { values } = parseArgs({
    args,
    options: {
      input: { type: "string" },
      ids: { type: "string" },
      output: { type: "string" },
      mappings: { type: "string" },
      offline: { type: "boolean" },
      refresh: { type: "boolean" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (!!values.input === !!values.ids)
    throw Error(
      "Supply exactly one of --input or --ids. Use --help for examples.",
    );
  if (values.offline && values.refresh)
    throw Error("Choose --offline or --refresh, not both.");
  const entries = readAnimeInput(
    values.input
      ? JSON.parse(await readFile(resolve(values.input), "utf8"))
      : values.ids.split(",").map((id) => Number(id.trim())),
  );
  const defaults = JSON.parse(
    await readFile(
      new URL("../data/api-trait-mappings.json", import.meta.url),
      "utf8",
    ),
  );
  let mappings = defaults;
  if (values.mappings) {
    const extra = validateMappings(
      JSON.parse(await readFile(resolve(values.mappings), "utf8")),
    );
    mappings = {
      version: `${defaults.version}+${extra.version}`,
      rules: [...defaults.rules, ...extra.rules],
    };
  }
  validateMappings(mappings);
  if (!values.offline && !env.MAL_CLIENT_ID)
    throw Error(
      "Set MAL_CLIENT_ID in .env first. No client secret or user login is needed for these public requests.",
    );
  if (!values.offline && entries.some((e) => e.tmdb) && !env.TMDB_READ_TOKEN)
    throw Error(
      "Input includes TMDB links: set TMDB_READ_TOKEN or remove those links.",
    );
  const output = resolve(values.output || ".data/api-traits");
  await mkdir(output, { recursive: true });
  const lockPath = join(output, "runner.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST")
      throw Error(
        `Another run may be using ${output}. After confirming no importer is running, delete runner.lock if a previous process crashed.`,
      );
    throw error;
  }
  let stopped = false;
  const stop = () => {
    stopped = true;
    console.log("Stopping after the current title; saving results.");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await lock.writeFile(String(process.pid));
    const api = createOfficialTraitApi({
      malClientId: env.MAL_CLIENT_ID,
      tmdbToken: env.TMDB_READ_TOKEN,
      cache: createDiskApiCache(join(output, "cache")),
      offline: values.offline,
      refresh: values.refresh,
    });
    const report = await runApiTraitBatch({
      entries,
      api,
      mappings,
      output,
      shouldStop: () => stopped,
      onProgress: (p) =>
        console.log(
          `[${p.processed}/${p.total}] MAL ${p.malId}: ${p.matches} mapped traits${p.errors.length ? `; ${p.errors.map((e) => `${e.provider}:${e.code}`).join(", ")}` : ""}`,
        ),
    });
    console.log(
      `Saved ${report.importableProfiles} importable profiles in ${output}. ${report.coverage.ruleCoveredTraits}/${report.coverage.totalTraits} keys have starter/custom mappings; others remain unknown.`,
    );
    return report.interrupted ? 130 : report.failedTitles ? 2 : 0;
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    await lock.close();
    await unlink(lockPath);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
